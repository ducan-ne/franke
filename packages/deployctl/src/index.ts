import cac from 'cac'
import Conf from 'conf'
import axios from 'axios'
import path from 'path'
import prettyBytes from 'pretty-bytes'
import isDomain from 'is-public-domain'
import { readPackageUp } from 'read-pkg-up'
import glob from 'fast-glob'
import { buildFunction } from './buildFunction'
import * as fs from 'fs'

const cli = cac('deployctl')

const conf = new Conf<{ endpoint: string, token: string }>({
  projectName: 'franke-deployctl',
})

const getApi = () => {
  return axios.create({
    baseURL: conf.get('endpoint') || 'https://franke.graph.vn',
    headers: { TOKEN: conf.get('token') || '' },
  })
}

cli
  .command('config-token <token>')
  .action((token) => {
    conf.set('token', token)
    console.log('Updated the config')
  })

cli
  .command('config-endpoint <endpoint>')
  .action((endpoint) => {
    conf.set('endpoint', endpoint)
    console.log('Updated the config')
  })

cli
  .command('deploy <target>')
  .action(async (target) => {
    const pkg = await readPackageUp()

    if (!pkg) {
      console.error('Can not resolve package.json, is it existing in your project?')
      return
    }

    const domain = pkg.packageJson?.franke?.domain
    const bucket = pkg.packageJson?.franke?.bucket
    const functionName = pkg.packageJson?.franke?.name || pkg.packageJson.name
    if (!domain) {
      console.error('You must linked a domain to the function. Add it to package.json ->' +
        ' franke.domain')
      return
    }

    if (!isDomain(domain)) {
      console.error(`${domain} is not a correct domain`)
      return
    }

    if (!functionName) {
      console.error('We couldnt determine function for the project')
      return
    }

    const file = path.resolve(process.cwd(), target || 'index.ts')

    const { outputFiles } = await buildFunction(file)
    const code = Buffer.from(outputFiles?.[0].contents.buffer! || '').toString()

    if (!code) {
      console.log('Can not bundle your entry')
      return
    }

    const assets: Array<{ name: string, content: string }> = []

    let size = 0

    if (bucket) {
      const files = await glob(bucket + '/**/**', {
        cwd: process.cwd(),
      })

      for (const file of files) {
        const content = fs.readFileSync(file).toString()
        assets.push({ name: file, content })
        size += Buffer.byteLength(content)
      }
    }

    try {
      console.log('Deploying function', functionName)
      console.log('Domain', domain)
      console.log('Function size: ', prettyBytes(Buffer.byteLength(code) + size))

      await getApi().post('edge-api/deploy', {
        bucket,
        code: code,
        name: functionName,
        domain: domain,
        assets,
      })
      console.log(`Succeed deploy function ${functionName} to edge network`)
    } catch (e) {
      console.log(e)
      console.log('Failed to deploy to edge network')
    }
  })

cli
  .command('logs')
  .action(() => {
    // TODO
    // currently read on docker logs is fine,
    // but we can wrap console.log to take the log, to separate the logs for each functions
  })

cli
  .command('stop')
  .action(async () => {
    const pkg = await readPackageUp()

    if (!pkg) {
      console.error('Can not resolve package.json, is it existing in your project?')
      return
    }

    const functionName = pkg.packageJson?.franke?.name || pkg.packageJson.name

    if (!functionName) {
      console.error('We couldnt determine function for the project')
      return
    }

    try {

      await getApi().post(`edge-api/stop/${functionName}`, {})
      console.log(`Stopped function ${functionName}`)
    } catch (e) {
      console.log(e)
      console.log('Failed to stop function')
    }
  })

cli
  .command('list')
  .action(async () => {
    try {

      const { data } = await getApi().get('edge-api/functions')
      console.log(JSON.stringify(data, null, 2))
    } catch (e) {
      console.log(e)
      console.log('Failed to stop function')
    }
  })

cli
  .command('get')
  .action(() => {
    // TODO
  })

cli.parse()
