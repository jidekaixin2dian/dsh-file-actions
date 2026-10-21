// Post (or update) the DSH "Show Your Plugins!" discussion for this plugin.
//
//   $env:GH_TOKEN = gh auth token
//   node post.mjs            # create
//   node post.mjs --update <discussionId>
//
// The repository and category ids are stable GraphQL node ids for
// deepseek-ai/deepseek-harness → "Show Your Plugins!".
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const token = process.env.GH_TOKEN || ''
if (!token) {
  console.error('GH_TOKEN is required (gh auth token)')
  process.exit(1)
}

const REPO_ID = 'R_kgDOT3T1gw'
const CATEGORY_ID = 'DIC_kwDOT3T1g84DDSUe'

const markdown = fs.readFileSync(path.join(here, 'DSH-POST.md'), 'utf8')
const lines = markdown.split(/\r?\n/)
const title = (lines.find((line) => line.startsWith('# ')) || '# dsh-file-actions').slice(2).trim()
const body = markdown.replace(/^# .*\r?\n/, '').trim()

const updateIndex = process.argv.indexOf('--update')
const discussionId = updateIndex === -1 ? null : process.argv[updateIndex + 1]

const query = discussionId
  ? `mutation($id:ID!, $body:String!) { updateDiscussion(input:{discussionId:$id, body:$body}) { discussion { url } } }`
  : `mutation($repo:ID!, $cat:ID!, $title:String!, $body:String!) {
       createDiscussion(input:{repositoryId:$repo, categoryId:$cat, title:$title, body:$body}) {
         discussion { url number }
       }
     }`

const variables = discussionId
  ? { id: discussionId, body }
  : { repo: REPO_ID, cat: CATEGORY_ID, title, body }

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'dsh-file-actions-promo',
  },
  body: JSON.stringify({ query, variables }),
})

const payload = await response.json()
if (!response.ok || payload.errors) {
  console.error('GraphQL failed:', JSON.stringify(payload, null, 2))
  process.exit(1)
}
const discussion = payload.data.createDiscussion?.discussion || payload.data.updateDiscussion?.discussion
console.log('ok:', discussion.url)
fs.writeFileSync(path.join(here, 'posted.json'), JSON.stringify({ url: discussion.url, number: discussion.number, at: new Date().toISOString() }, null, 2))
