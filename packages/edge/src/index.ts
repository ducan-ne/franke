import 'dotenv/config'
import app from '@/api'
import { initializeFunctions } from '@/vm'

initializeFunctions()
app.listen({
  port: 4000,
}, () => {
  console.log('Edge network running')
})
