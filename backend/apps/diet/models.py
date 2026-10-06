import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower


class DietSection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="diet_sections"
    )
    name = models.CharField(max_length=120)
    display_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"), "user", name="unique_diet_section_name"
            )
        ]


class DietFood(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    section = models.ForeignKey(
        DietSection, on_delete=models.CASCADE, related_name="foods"
    )
    name = models.CharField(max_length=120)
    display_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"), "section", name="unique_diet_food_name"
            )
        ]


class DietEntry(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="diet_entries"
    )
    food = models.ForeignKey(DietFood, on_delete=models.CASCADE, related_name="entries")
    performed_on = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["performed_on", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "food", "performed_on"], name="unique_daily_diet_entry"
            )
        ]
        indexes = [
            models.Index(fields=["user", "performed_on"], name="diet_user_day_idx")
        ]

    def clean(self) -> None:
        super().clean()
        if self.food_id and self.user_id != self.food.section.user_id:
            raise ValidationError({"food": "Food must belong to the entry owner."})
