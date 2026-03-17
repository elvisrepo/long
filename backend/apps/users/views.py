from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.users.serializers import RegisterSerializer


@api_view(["POST"])
def register_view(request):
      serializer = RegisterSerializer(data=request.data)

      if not serializer.is_valid():
          return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

      user = serializer.save()

      return Response(
          {
              "email": user.email,
          },
          status=status.HTTP_201_CREATED,
      )