import { defineConfig } from 'vite'

// Set base to repo name for GitHub Pages if needed, e.g. '/CHILES_Con_Pol_DataTest/'
export default defineConfig({
  base: process.env.VITE_BASE || '/',
})

