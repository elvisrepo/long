from collections.abc import Iterator
import logging
from typing import Any

from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Q, QuerySet
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from apps.metrics.models import MetricDefinition, MetricEntry
from apps.diet.models import DietEntry, DietFood, DietSection
from apps.recovery.models import RecoveryEntry, RecoveryTool
from apps.subscriptions.models import BillingCustomer, CheckoutAttempt, Subscription
from apps.subscriptions.services import UnresolvedCheckoutError, cancel_account_billing
from apps.users.models import User
from apps.wearables.models import SyncRun, WearableConnection
from apps.workouts.models import (
    Exercise,
    ExerciseCategory,
    Workout,
    WorkoutCatalogState,
    WorkoutExercise,
    WorkoutSet,
    WorkoutRoutine,
    RoutineDay,
    RoutineExercise,
    RoutineSet,
)


class AccountBillingConflict(APIException):
    status_code = 409
    default_detail = "An unfinished checkout needs billing verification before account deletion. Your account has not been deleted."


class AccountBillingUnavailable(APIException):
    status_code = 502
    default_detail = "Billing cancellation could not be confirmed. Your account has not been deleted. Please try again."


logger = logging.getLogger(__name__)


def account_export(user: User) -> Iterator[str]:
    """Stream explicit personal-data fields; never serialize auth credentials."""
    encoder = DjangoJSONEncoder(indent=2)
    header = {
        "schema_version": 1,
        "exported_at": timezone.now(),
        "profile": {
            "id": user.pk,
            "email": user.email,
            "sleep_target_minutes": user.sleep_target_minutes,
            "last_login": user.last_login,
        },
    }
    # Avoid a single enormous line that text editors struggle to render.
    yield encoder.encode(header).removesuffix("\n}")
    sections: dict[str, QuerySet[Any]] = {
        "workout_routines": WorkoutRoutine.objects.filter(user=user)
        .order_by("id")
        .values("id", "name", "notes", "display_order", "is_active"),
        "routine_days": RoutineDay.objects.filter(routine__user=user)
        .order_by("id")
        .values("id", "routine_id", "name", "notes", "display_order"),
        "routine_exercises": RoutineExercise.objects.filter(
            day__routine__user=user, exercise__category__user=user
        )
        .order_by("id")
        .values(
            "id",
            "day_id",
            "exercise_id",
            "exercise_name",
            "group_name",
            "group_colour",
            "category_name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
            "display_order",
        ),
        "routine_sets": RoutineSet.objects.filter(
            routine_exercise__day__routine__user=user,
            routine_exercise__exercise__category__user=user,
        )
        .order_by("id")
        .values(
            "id",
            "routine_exercise_id",
            "display_order",
            "weight",
            "reps",
            "distance",
            "duration_seconds",
        ),
        "workout_catalog_state": WorkoutCatalogState.objects.filter(user=user).values(
            "initialized_at"
        ),
        "exercise_categories": ExerciseCategory.objects.filter(user=user)
        .order_by("id")
        .values("id", "name", "display_order", "is_active"),
        "exercises": Exercise.objects.filter(category__user=user)
        .order_by("id")
        .values(
            "id",
            "category_id",
            "name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
            "notes",
            "weight_increment",
            "rest_seconds",
            "display_order",
            "is_active",
        ),
        "workouts": Workout.objects.filter(user=user)
        .order_by("id")
        .values("id", "performed_on", "name", "notes", "is_finished", "created_at"),
        "workout_exercises": WorkoutExercise.objects.filter(
            workout__user=user, exercise__category__user=user
        )
        .order_by("id")
        .values(
            "id",
            "workout_id",
            "exercise_id",
            "exercise_name",
            "group_name",
            "group_colour",
            "category_name",
            "tracking_type",
            "weight_unit",
            "distance_unit",
            "display_order",
        ),
        "workout_sets": WorkoutSet.objects.filter(
            workout_exercise__workout__user=user,
            workout_exercise__exercise__category__user=user,
        )
        .order_by("id")
        .values(
            "id",
            "workout_exercise_id",
            "display_order",
            "weight",
            "reps",
            "distance",
            "duration_seconds",
            "comment",
            "is_completed",
        ),
        "diet_sections": DietSection.objects.filter(user=user)
        .order_by("id")
        .values("id", "name", "display_order", "is_active"),
        "diet_foods": DietFood.objects.filter(section__user=user)
        .order_by("id")
        .values("id", "section_id", "name", "display_order", "is_active"),
        "diet_entries": DietEntry.objects.filter(user=user, food__section__user=user)
        .order_by("id")
        .values("id", "food_id", "performed_on", "created_at"),
        "recovery_tools": RecoveryTool.objects.filter(
            Q(user=user) | Q(entries__user=user)
        )
        .distinct()
        .order_by("id")
        .values(
            "id", "user_id", "slug", "name", "description", "is_active", "display_order"
        ),
        "recovery_entries": RecoveryEntry.objects.filter(user=user)
        .order_by("id")
        .values("id", "tool_id", "performed_on", "created_at"),
        "metric_definitions": MetricDefinition.objects.filter(
            Q(user=user) | Q(entries__user=user)
        )
        .distinct()
        .order_by("id")
        .values(
            "id",
            "name",
            "slug",
            "unit",
            "category",
            "min_value",
            "max_value",
            "is_default",
            "is_active",
            "metadata",
        ),
        "metric_entries": MetricEntry.objects.filter(user=user)
        .order_by("id")
        .values(
            "id",
            "metric_definition_id",
            "value",
            "period_start",
            "recorded_at",
            "source",
            "source_connection_id",
            "external_source_id",
            "source_record_modified_at",
            "context",
            "created_at",
        ),
        "wearable_connections": WearableConnection.objects.filter(user=user)
        .order_by("id")
        .values(
            "id",
            "provider",
            "status",
            "is_active",
            "last_synced_at",
            "last_error",
            "created_at",
            "updated_at",
        ),
        "sync_runs": SyncRun.objects.filter(wearable_connection__user=user)
        .order_by("id")
        .values(
            "id",
            "wearable_connection_id",
            "upload_id",
            "status",
            "received_at",
            "processing_started_at",
            "finished_at",
            "entries_imported",
            "entries_updated",
            "entries_skipped",
            "error_code",
            "error_detail",
            "metadata",
        ),
        "billing_customers": BillingCustomer.objects.filter(user=user)
        .order_by("id")
        .values(
            "id",
            "provider",
            "provider_customer_id",
            "created_at",
            "updated_at",
        ),
        "subscriptions": Subscription.objects.filter(user=user)
        .order_by("id")
        .values(
            "id",
            "plan__code",
            "plan__name",
            "price__currency",
            "price__unit_amount",
            "price__billing_interval",
            "status",
            "provider",
            "provider_customer_id",
            "provider_subscription_id",
            "current_period_start",
            "current_period_end",
            "cancel_at",
            "cancel_at_period_end",
            "cancelled_at",
            "created_at",
            "updated_at",
        ),
        "checkout_attempts": CheckoutAttempt.objects.filter(user=user)
        .order_by("id")
        .values(
            "id",
            "price_id",
            "expected_subscription_id",
            "status",
            "provider_checkout_session_id",
            "created_at",
            "updated_at",
        ),
        "sessions": OutstandingToken.objects.filter(user=user)
        .order_by("id")
        .values(
            "created_at",
            "expires_at",
        ),
    }
    for name, rows in sections.items():
        yield f',\n  "{name}": ['
        separator = "\n"
        for row in rows.iterator(chunk_size=1000):
            yield separator + "\n".join(
                "    " + line for line in encoder.encode(row).splitlines()
            )
            separator = ",\n"
        yield "\n  ]"
    yield "\n}\n"


@transaction.atomic
def delete_account(*, user: User, password: str) -> None:
    user = User.objects.select_for_update().get(pk=user.pk)
    if not user.check_password(password):
        raise ValidationError({"password": ["Password is incorrect."]})
    try:
        cancel_account_billing(user=user)
    except UnresolvedCheckoutError:
        raise AccountBillingConflict() from None
    except Exception as exc:
        # Provider error bodies may contain PII; log only the exception class.
        logger.error("Account billing cleanup failed (%s)", type(exc).__name__)
        raise AccountBillingUnavailable() from None
    # Remove protected dependents before Django cascades account-owned rows.
    MetricEntry.objects.filter(user=user).delete()
    CheckoutAttempt.objects.filter(user=user).delete()
    # SimpleJWT uses SET_NULL on User deletion; explicitly erase credentials.
    OutstandingToken.objects.filter(user=user).delete()
    user.delete()
