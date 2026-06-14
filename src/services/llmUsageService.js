import { get, post } from '../api/v9/client';

const ENDPOINTS = {
  SEQUENCE: '/v9/api/llm-usage/sequence',
  USAGE: '/v9/api/llm-usage',
};

const LOCAL_STORAGE_KEY = 'llmUsageLocal';
const LOCAL_SEQ_KEY = 'llmUsageLocalSeq';

export async function fetchTransactionSeq() {
  const response = await get(ENDPOINTS.SEQUENCE);
  if (response?.status === 'SUCCESS' && response?.data?.transactionSeq !== undefined) {
    return response.data.transactionSeq;
  }
  throw new Error(response?.message || 'transaction_seq 발급 실패');
}

export async function createLlmUsage(payload) {
  return post(ENDPOINTS.USAGE, payload);
}

export function getLocalTransactionSeq() {
  const current = Number(localStorage.getItem(LOCAL_SEQ_KEY) || '0');
  const next = current + 1;
  localStorage.setItem(LOCAL_SEQ_KEY, String(next));
  return next;
}

export function saveLocalUsage(payload) {
  const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
  const existing = existingRaw ? JSON.parse(existingRaw) : [];
  existing.push(payload);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
}
