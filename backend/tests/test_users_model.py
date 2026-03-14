import pytest
from django.contrib.auth import get_user_model

from apps.users.models import build_email_lookup_hash

pytestmark = pytest.mark.django_db

def test_create_user_normalizes_email_and_sets_lookup_hash():
    User = get_user_model()

    user = User.objects.create_user(
          email="  Alice@example.COM  ",
          password="strong-password-123",
      )
    
    assert user.email == "alice@example.com"
    assert user.email_lookup_hash == build_email_lookup_hash("alice@example.com")