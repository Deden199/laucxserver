import axios from 'axios';
import { config } from '../config';

const tgCfg = (config.api && (config.api as any).telegram) || { botToken: '', chatId: '' };

const createTelegramHeaders = () => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

const telegramAxiosInstance = axios.create({
  baseURL: `https://api.telegram.org/bot${tgCfg.botToken}`,
  headers: createTelegramHeaders(),
});

const sendTelegramMessage = async (chatId: string, text: string) => {
  try {
    const response = await telegramAxiosInstance.post('/sendMessage', {
      chat_id: chatId,
      text,
    });
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

export { telegramAxiosInstance, sendTelegramMessage };