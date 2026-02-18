# PDF Async Export Implementation

## Muammo
PDF eksport 1-2 daqiqa davom etmoqda va foydalanuvchi kutishi kerak.

## Yechim
Word eksport kabi asynchronous qilish - BullMQ queue orqali background da generatsiya.

## Arxitektura

```
User clicks "PDF yuklash"
  ↓
Frontend: POST /tests/:id/export-pdf-async
  ↓
Backend: Add job to pdfExportQueue
  ↓
Return: { jobId, status: 'queued' }
  ↓
Frontend: Poll /tests/pdf-export-status/:jobId
  ↓
Worker: Generate PDF in background
  ↓
Save to local storage (or S3)
  ↓
Return: { status: 'completed', fileUrl }
  ↓
Frontend: Auto-download file
```

## Implementation Steps

### 1. Create PDF Export Queue
`server/src/services/queue/pdfExportQueue.ts`

### 2. Add Async Route
`server/src/routes/test.routes.ts`
- POST `/:id/export-pdf-async` - Start job
- GET `/pdf-export-status/:jobId` - Check status

### 3. Update Worker
`server/src/worker.ts`
- Register PDF queue worker

### 4. Frontend Updates
`client/src/pages/teacher/TestPrintPage.tsx`
- Add async PDF export logic
- Progress bar
- Auto-download

## Benefits
✅ Foydalanuvchi kutmaydi  
✅ Progress bar ko'rsatiladi  
✅ Background da ishlaydi  
✅ Word eksport bilan bir xil UX  
✅ Scalable (ko'p foydalanuvchilar uchun)

## Status
🔄 Implementation in progress...
