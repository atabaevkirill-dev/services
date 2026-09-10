import { isTauri } from '../repairs/repo'
import type { VisionProvider, VisionSettings } from './types'

/**
 * Запросы к vision-модели.
 *
 * Два бэкенда: локальная Ollama и любой OpenAI-совместимый сервер
 * (LM Studio, vLLM, llama.cpp, облачные API). Облачный провайдер `zai`
 * из исходного проекта сюда не переехал: его SDK работает только в Node,
 * а здесь весь разбор идёт во фронтенде.
 *
 * Запрос уходит через HTTP-плагин Tauri, а не через обычный fetch:
 * страница приложения живёт на своём origin, и Ollama отклонила бы
 * такой запрос по CORS.
 */

/** fetch, которому не мешает политика источников. В браузере — обычный. */
async function request(url: string, init: RequestInit): Promise<Response> {
  if (!isTauri()) return fetch(url, init)
  const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
  return tauriFetch(url, init)
}

const trimUrl = (u: string) => u.trim().replace(/\/+$/, '')

/** Отвечает ли Ollama по указанному адресу и какие модели у неё есть. */
export async function ollamaModels(url: string): Promise<string[] | null> {
  try {
    const res = await request(`${trimUrl(url)}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { models?: { name?: string }[] }
    return (data.models ?? []).map((m) => String(m.name ?? '')).filter(Boolean)
  } catch {
    return null
  }
}

/** Подпись провайдера для интерфейса. */
export function providerLabel(s: VisionSettings): string {
  if (s.provider === 'ollama') return `${s.ollamaModel} · Ollama (локально)`
  return `${s.openaiModel || 'vision'} · внешний сервер`
}

/** Один запрос: промпт и одна страница (data:image/...;base64) → сырой текст ответа. */
export async function visionChat(s: VisionSettings, prompt: string, imageDataUrl: string): Promise<string> {
  return s.provider === 'ollama' ? ollamaChat(s, prompt, imageDataUrl) : openaiChat(s, prompt, imageDataUrl)
}

async function ollamaChat(s: VisionSettings, prompt: string, imageDataUrl: string): Promise<string> {
  const base64 = imageDataUrl.replace(/^data:[^,]+,/, '')
  const res = await request(`${trimUrl(s.ollamaUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: s.ollamaModel,
      messages: [{ role: 'user', content: prompt, images: [base64] }],
      stream: false,
      // жёсткий JSON-режим: локальные модели без него охотно добавляют пояснения
      format: 'json',
      options: { temperature: 0, num_ctx: 8192 },
    }),
    signal: AbortSignal.timeout(600_000),
  })
  if (!res.ok) throw new Error(`Ollama ответила ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { message?: { content?: string } }
  return data.message?.content ?? ''
}

async function openaiChat(s: VisionSettings, prompt: string, imageDataUrl: string): Promise<string> {
  const base = trimUrl(s.openaiBaseUrl)
  if (!base) throw new Error('Не указан адрес сервера распознавания в настройках')
  const res = await request(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(s.openaiKey ? { Authorization: `Bearer ${s.openaiKey}` } : {}),
    },
    body: JSON.stringify({
      model: s.openaiModel || 'vision',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(600_000),
  })
  if (!res.ok) throw new Error(`Сервер распознавания ответил ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

/** Провайдер, с которым имеет смысл работать: проверяем, поднята ли Ollama. */
export async function checkProvider(s: VisionSettings): Promise<{ ok: boolean; note: string }> {
  if (s.provider === 'ollama') {
    const models = await ollamaModels(s.ollamaUrl)
    if (models === null) return { ok: false, note: `Ollama не отвечает на ${s.ollamaUrl}` }
    if (!models.includes(s.ollamaModel)) {
      return { ok: false, note: `Модели ${s.ollamaModel} нет в Ollama. Установленные: ${models.join(', ') || 'нет ни одной'}` }
    }
    return { ok: true, note: providerLabel(s) }
  }
  if (!s.openaiBaseUrl.trim()) return { ok: false, note: 'Не указан адрес сервера распознавания' }
  return { ok: true, note: providerLabel(s) }
}

export type { VisionProvider }
