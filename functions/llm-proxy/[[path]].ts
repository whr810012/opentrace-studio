/// <reference types="@cloudflare/workers-types" />
import { handleLlmProxy } from '../_shared/llmProxy'

/** 直连 *.pages.dev（无 /opentrace 前缀）时的兼容路由 */
export const onRequest: PagesFunction = (context) =>
  handleLlmProxy(context.request, context.params)
