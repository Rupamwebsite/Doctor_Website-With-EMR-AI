# Doctor Master Setup (Node.js + MySQL)

Ready-to-run example API for adding doctors via an admin "master setup" and showing active doctors publicly.

## Quick start

1. Copy `.env.template` to `.env` and fill your DB credentials.
2. Create the MySQL database and table:
   ```
   mysql -u root -p < migrations.sql
   ```
3. Install dependencies:
   ```
   npm install
   npm install --save-dev nodemon
   ```
4. Run:
   ```
   npm run dev
   ```
5. Admin endpoints require header `x-admin-key` set to the value in `.env` (ADMIN_KEY).

API endpoints:
- GET /api/doctors
- GET /api/doctors/:id
- POST /api/admin/doctors (multipart/form-data) [admin]
- PUT /api/admin/doctors/:id (multipart/form-data) [admin]
- PATCH /api/admin/doctors/:id/status [admin]
- DELETE /api/admin/doctors/:id [admin]
