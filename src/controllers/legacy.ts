import { createModelsList } from '../config/providers'

export const handleOpenAIModels = (c: any) => c.json(createModelsList('nvidia'))

export const handleClaudeModels = (c: any) => c.json(createModelsList('claude'))
