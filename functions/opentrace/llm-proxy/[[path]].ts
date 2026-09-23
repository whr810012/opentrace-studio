/// <reference types="@cloudflare/workers-types" />
import { handleLlmProxy } from '../../_shared/llmProxy'

export const onRequest: PagesFunction = (context) =>
  handleLlmProxy(context.request, context.params)
