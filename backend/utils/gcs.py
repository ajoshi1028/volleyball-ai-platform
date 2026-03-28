import json
import os
from google.cloud import storage

BUCKET_NAME = "pepperdine-volleyball-2026"

# Support both env var and hardcoded path
CREDENTIALS_PATH = os.environ.get(
    "GOOGLE_APPLICATION_CREDENTIALS",
    os.path.expanduser("~/.volleyball-backend-key.json"),
)


def _gcs_client() -> storage.Client:
    """
    Build a GCS client.
    Checks GCS_CREDENTIALS_JSON env var first (for Railway/cloud deployment),
    then falls back to the local credentials file.
    """
    creds_json = os.getenv("GCS_CREDENTIALS_JSON")
    if creds_json:
        return storage.Client.from_service_account_info(json.loads(creds_json))
    if not os.path.exists(CREDENTIALS_PATH):
        raise FileNotFoundError(
            f"GCS credentials not found at {CREDENTIALS_PATH}. "
            "Set GOOGLE_APPLICATION_CREDENTIALS env var or place the key file at ~/.volleyball-backend-key.json"
        )
    return storage.Client.from_service_account_json(CREDENTIALS_PATH)


def upload_to_gcs(local_file_path: str, destination_blob_name: str) -> str:
    """
    Upload a file to Google Cloud Storage.

    Returns:
        GCS URI (e.g., "gs://pepperdine-volleyball-2026/raw-videos/practice1.mp4")
    """
    client = _gcs_client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_filename(local_file_path)
    return f"gs://{BUCKET_NAME}/{destination_blob_name}"


def download_from_gcs(blob_name: str, local_file_path: str) -> None:
    """
    Download a file from Google Cloud Storage.
    """
    client = _gcs_client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_name)

    if not blob.exists():
        raise FileNotFoundError(f"Blob '{blob_name}' not found in bucket '{BUCKET_NAME}'")

    blob.download_to_filename(local_file_path)
