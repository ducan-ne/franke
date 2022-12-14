import 'dotenv/config'
import app from '@/api'
import { initializeFunctions } from '@/vm'

initializeFunctions().catch(console.log)
app.listen({
  port: 4000,
  host: '0.0.0.0',
}, () => {
  console.log('Edge network running')
})
