from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.services import CURRENT_SUBSCRIPTION_STATUSES


class Command(BaseCommand):
    help = (
        "Create active Free subscriptions for users who do not have a current "
        "subscription."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many users would be backfilled without writing rows.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        dry_run = bool(options["dry_run"])
        free_plan = SubscriptionPlan.objects.get(
            code="free",
            is_active=True,
            is_default=True,
        )
        current_subscription_user_ids = Subscription.objects.filter(
            status__in=CURRENT_SUBSCRIPTION_STATUSES,
        ).values("user_id")
        users_without_current_subscription = get_user_model().objects.exclude(
            id__in=current_subscription_user_ids,
        )
        missing_count = users_without_current_subscription.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"{missing_count} users would receive an active Free subscription."
                )
            )
            return

        with transaction.atomic():
            created_count = 0

            for user in users_without_current_subscription.select_for_update():
                has_current_subscription = Subscription.objects.filter(
                    user=user,
                    status__in=CURRENT_SUBSCRIPTION_STATUSES,
                ).exists()

                if has_current_subscription:
                    continue

                Subscription.objects.create(
                    user=user,
                    plan=free_plan,
                    status=Subscription.Status.ACTIVE,
                )
                created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Created {created_count} active Free subscriptions."
            )
        )
