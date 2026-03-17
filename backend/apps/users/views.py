import json

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.http import HttpResponseNotAllowed, JsonResponse

from apps.users.models import build_email_lookup_hash


def register_view(request):
    if request.method != "POST":
          return HttpResponseNotAllowed(["POST"])
    
    payload = json.loads(request.body or "{}")

    errors = {}
    email = payload.get("email")
    password = payload.get("password")

    if not email:
          errors["email"] = ["This field is required."]
    if not password:
          errors["password"] = ["This field is required."]

    if errors:
          return JsonResponse(errors, status=400)

    if get_user_model().objects.filter(
          email_lookup_hash=build_email_lookup_hash(email)
      ).exists():
          return JsonResponse(
              {
                  "email": ["A user with that email already exists."],
              },
              status=400,
          )

    try:
          user = get_user_model().objects.create_user(
              email=email,
              password=payload["password"],
          )
    except IntegrityError:
          return JsonResponse(
                {
                  "email": ["A user with that email already exists."],
              },
              status=400,
          )
    
    return JsonResponse(
          {
              "email": user.email,
          },
          status=201,
      )