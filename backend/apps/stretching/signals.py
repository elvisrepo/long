from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import StretchExercise
from .storage import delete_stretch_image


@receiver(post_delete, sender=StretchExercise)
def delete_custom_stretch_image(
    sender: type[StretchExercise], instance: StretchExercise, **kwargs: object
) -> None:
    if instance.user_id is not None and instance.image_key:
        delete_stretch_image(instance.image_key)
