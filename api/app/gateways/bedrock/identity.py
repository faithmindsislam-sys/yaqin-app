"""Only the explicit app profile or the attached ECS role may sign provider calls."""
import boto3
from botocore.credentials import ContainerProvider


def task_credentials():
    credentials = ContainerProvider().load()
    if credentials is None:
        raise RuntimeError("Attached application credentials unavailable")
    return credentials


def session(settings, region):
    if settings.aws_profile:
        return boto3.Session(profile_name=settings.aws_profile, region_name=region)
    if not settings.aws_enabled:
        raise RuntimeError("Application AWS identity is required")
    credentials = task_credentials()
    frozen = credentials.get_frozen_credentials()
    result = boto3.Session(region_name=region, aws_access_key_id=frozen.access_key,
                           aws_secret_access_key=frozen.secret_key, aws_session_token=frozen.token)
    result._session._credentials = credentials  # Preserve refresh through the ECS provider.
    return result
