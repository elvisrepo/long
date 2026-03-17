import pytest
from django.contrib.auth import get_user_model
from django.db import connection

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

# “at rest” means “how the value is stored in the database”
def test_email_is_encrypted_at_rest():

    '''
         if you used the ORM like User.objects.get(...), Django might deserialize/decrypt 
         the value for you
        - we do not want that here
        - we want the raw stored database value
                cursor.execute
          - runs raw SQL against the table directly
          - fetches the exact stored contents of the email column for that user row
    '''

    User = get_user_model()

    user = User.objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
    )

    # opens a raw database cursor - this bypasses normal ORM field conversion logic
    with connection.cursor() as cursor:
          cursor.execute(
              "SELECT email FROM users_user WHERE id = %s",
              [str(user.id)],
          )
          (stored_value,) = cursor.fetchone()
    
    assert stored_value != "alice@example.com"
    assert "alice@example.com" not in stored_value

def test_manager_can_find_user_by_plaintext_email():
     User = get_user_model()

     user = User.objects.create_user(
          email="alice@example.com",
          password="strong-password-123",
     )

     fetched = User.objects.get_by_natural_key("ALICE@example.com")
     assert fetched.pk == user.pk