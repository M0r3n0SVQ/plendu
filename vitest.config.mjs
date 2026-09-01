import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      // Route module creates its OpenAI client at import time based on this.
      // A fake key is enough — none of the current tests reach the real
      // OpenAI call (they all fail validation before that point).
      OPENAI_API_KEY: 'sk-test-fake-key-for-tests',
    },
  },
})
