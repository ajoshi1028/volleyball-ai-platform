import os
from google.cloud import storage

BUCKET_NAME = "pepperdine-volleyball-2026"
CREDENTIALS_PATH = os.path.expanduser("~/.volleyball-backend-key.json")


def upload_to_gcs(local_file_path: str, destination_blob_name: str) -> str:
    """
    Upload a file to Google Cloud Storage.

    Args:
        local_file_path: Path to the local file
        destination_blob_name: Path in GCS bucket (e.g., "raw-videos/practice1.mp4")

    Returns:
        GCS URI (e.g., "gs://pepperdine-volleyball-2026/raw-videos/practice1.mp4")
    """
    client = storage.Client.from_service_account_json(CREDENTIALS_PATH)
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(destination_blob_name)

    blob.upload_from_filename(local_file_path)

    gcs_uri = f"gs://{BUCKET_NAME}/{destination_blob_name}"
    return gcs_uri


def download_from_gcs(destination_blob_name: str, local_file_path: str) -> None:
    """
    Download a file from Google Cloud Storage.

    Args:
        destination_blob_name: Path in GCS bucket (e.g., "raw-videos/practice1.mp4")
        local_file_path: Where to save the file locally
    """
    client = storage.Client.from_service_account_json(CREDENTIALS_PATH)
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(destination_blob_name)

    blob.download_to_filename(local_file_path)
