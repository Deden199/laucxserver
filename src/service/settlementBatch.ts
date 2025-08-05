import { prisma } from '../core/prisma';
import logger from '../logger';
import { sendTelegramMessage } from '../core/telegram.axios';
import { config } from '../config';
import { processBatchLoop } from '../cron/settlement';

/**
 * Run one iteration of the settlement batch process.
 * Logs start/completion/error to logger & Telegram and persists a run history record.
 */
export async function runSettlementBatch(adminId: string) {
  const chatId = config.api.telegram.adminChannel;
  const start = new Date();

  // create audit record
  const run = await prisma.settlementBatchRun.create({
    data: {
      adminId,
      startedAt: start,
      status: 'RUNNING'
    }
  });

  const startMsg = `[SettlementBatch] started by ${adminId} at ${start.toISOString()}`;
  logger.info(startMsg);
  try {
    await sendTelegramMessage(chatId, startMsg);
  } catch (err) {
    logger.error('[SettlementBatch] Failed to send start notification:', err);
  }

  try {
    const { settledCount, netAmount } = await processBatchLoop();
    const end = new Date();
    const completeMsg = `[SettlementBatch] completed: settled ${settledCount} orders, net amount ${netAmount}`;
    logger.info(completeMsg);
    try {
      await sendTelegramMessage(chatId, completeMsg);
    } catch (err) {
      logger.error('[SettlementBatch] Failed to send completion notification:', err);
    }

    await prisma.settlementBatchRun.update({
      where: { id: run.id },
      data: {
        endedAt: end,
        settledCount,
        netAmount,
        status: 'SUCCESS'
      }
    });

    return { settledCount, netAmount };
  } catch (err: any) {
    const end = new Date();
    const errorMsg = `[SettlementBatch] error: ${err.message}`;
    logger.error(errorMsg);
    try {
      await sendTelegramMessage(chatId, errorMsg);
    } catch (sendErr) {
      logger.error('[SettlementBatch] Failed to send error notification:', sendErr);
    }

    await prisma.settlementBatchRun.update({
      where: { id: run.id },
      data: {
        endedAt: end,
        status: 'ERROR',
        error: err.message
      }
    });

    throw err;
  }
}
