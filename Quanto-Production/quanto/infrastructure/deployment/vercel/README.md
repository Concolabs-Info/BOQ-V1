# Frontend deployment

Deploy `frontend/` as the Next.js root. Set `NEXT_PUBLIC_API_URL` to the public `/api/v1` endpoint. The value is bundled into browser code, so rebuild after changing it.

Do not deploy the current Python API/storage pair as an ephemeral function: Pre writes original PDFs, renders and crops. Use the persistent worker/API deployment described in `../worker/` or replace the storage service first.
