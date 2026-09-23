from django.conf import settings

def test_test_environment_uses_fake_stripe_credentials():
      assert settings.STRIPE_SECRET_KEY == "sk_test_fake"
      assert settings.STRIPE_WEBHOOK_SECRET == "whsec_fake"
      assert settings.STRIPE_CHECKOUT_SUCCESS_URL == (
          "http://localhost:5173/settings?checkout=success"
      )
      assert settings.STRIPE_CHECKOUT_CANCEL_URL == (
          "http://localhost:5173/settings?checkout=cancelled"
      )