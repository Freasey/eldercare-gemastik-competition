import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { cronRouter } from './cron.routes.js';
import { eldersRouter } from './elders.routes.js';
import { schedulesRouter } from './schedules.routes.js';
import { remindersRouter } from './reminders.routes.js';
import { checkinsRouter } from './checkins.routes.js';
import { summariesRouter, timelineRouter } from './summaries.routes.js';
import { assistantRouter } from './assistant.routes.js';
import { emergencyRouter } from './emergency.routes.js';
import { devicesRouter } from './devices.routes.js';
import { sttRouter } from './stt.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/cron', cronRouter);
apiRouter.use('/devices', devicesRouter);
apiRouter.use('/stt', sttRouter);

// Semua yang nested di bawah seorang lansia. `mergeParams` di tiap router
// membuat :elderId tetap terbaca oleh requireElderAccess.
apiRouter.use('/elders/:elderId/schedules', schedulesRouter);
apiRouter.use('/elders/:elderId/reminders', remindersRouter);
apiRouter.use('/elders/:elderId/checkins', checkinsRouter);
apiRouter.use('/elders/:elderId/assistant', assistantRouter);
apiRouter.use('/elders/:elderId/emergencies', emergencyRouter);
apiRouter.use('/elders/:elderId/summaries', summariesRouter);
// timeline + transkrip percakapan: /elders/:elderId/timeline, /elders/:elderId/conversations/:id
apiRouter.use('/elders/:elderId', timelineRouter);

apiRouter.use('/elders', eldersRouter);
