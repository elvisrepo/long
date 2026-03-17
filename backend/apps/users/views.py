import json

from django.contrib.auth import get_user_model
from django.http import HttpResponseNotAllowed, JsonResponse


def register_view(request):
    if request.method != "POST":
          return HttpResponseNotAllowed(["POST"])
    
    payload = json.loads(request.body or "{}")

    user = get_user_model().objects.create_user(
          email=payload["email"],
          password=payload["password"],
      )
    
    return JsonResponse(
          {
              "email": user.email,
          },
          status=201,
      )