import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'
import React from 'react'
import { act, create } from 'react-test-renderer'

// Compile the actual production component, not a copied upload state machine.
const directory = await mkdtemp(new URL('../.artwork-component-test-', import.meta.url))
let ArtworkEditor
try {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/client/artwork-editor.tsx', import.meta.url))],
    bundle: true, write: false, format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] })
  const file = `${directory}/component.mjs`
  await writeFile(file, result.outputFiles[0].text)
  ArtworkEditor = (await import(pathToFileURL(file).href)).ArtworkEditor
} finally { await rm(directory, { recursive: true, force: true }) }

const asset = `${'a'.repeat(64)}.png`
const translate = key => key
async function fixture(t) {
  const originals = Object.fromEntries(['Image', 'fetch', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.Image = class { naturalWidth = 20; naturalHeight = 20; decode() { return Promise.resolve() } }
  globalThis.document = { baseURI: 'http://dsh.test/' }
  const response = Promise.withResolvers()
  const started = Promise.withResolvers()
  globalThis.fetch = async () => { started.resolve(); return response.promise }
  const changes = []
  const editor = { values: {}, draft: undefined, profileRevision: 0, disabled: false, stale: false,
    edit(value) { changes.push(value) } }
  let root
  await act(async () => { root = create(React.createElement(ArtworkEditor, { id: 'com.dsh.skin.night-navigator', editor, t: translate })) })
  t.after(async () => {
    await act(async () => root.unmount())
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  })
  await act(async () => {
    root.root.findByProps({ type: 'file' }).props.onChange({ currentTarget: {
      files: [new File(['test'], 'portrait.png', { type: 'image/png' })], value: 'portrait.png',
    } })
    await started.promise
  })
  return {
    root, changes,
    async rerender(extra = {}) {
      await act(async () => root.update(React.createElement(ArtworkEditor, {
        id: 'com.dsh.skin.night-navigator', editor: { ...editor, values: {}, ...extra }, t: translate,
      })))
    },
    async complete() {
      await act(async () => {
        response.resolve(Response.json({ asset }))
        await new Promise(resolve => setImmediate(resolve))
      })
    },
  }
}

test('actual ArtworkEditor accepts first upload after parent rerenders with a fresh empty preferences object', async t => {
  const f = await fixture(t)
  await f.rerender()
  await f.complete()
  assert.equal(f.changes.length, 1)
  assert.equal(f.changes[0].artwork.asset, asset)
  assert.equal(f.root.root.findAllByProps({ role: 'alert' }).length, 0)
})

test('actual ArtworkEditor does not overwrite changed preferences while upload is pending', async t => {
  const f = await fixture(t)
  await f.rerender({ values: { quality: 'low' } })
  await f.complete()
  assert.equal(f.changes.length, 0)
  assert.equal(f.root.root.findAllByProps({ role: 'alert' }).length, 1)
})

test('actual ArtworkEditor rejects an upload after profile revision changed even if preferences stay empty', async t => {
  const f = await fixture(t)
  await f.rerender({ profileRevision: 1 })
  await f.complete()
  assert.equal(f.changes.length, 0)
  assert.equal(f.root.root.findAllByProps({ role: 'alert' }).length, 1)
})

test('actual ArtworkEditor rejects an upload after the package revision changes', async t => {
  const f = await fixture(t)
  await f.rerender({ packageRevision: 'updated' })
  await f.complete()
  assert.equal(f.changes.length, 0)
})

test('cancelled uploads cannot edit a draft even if the result arrives later', async t => {
  const f = await fixture(t)
  await act(async () => f.root.root.findByProps({ children: 'artworkCancel' }).props.onClick())
  await f.complete()
  assert.equal(f.changes.length, 0)
  assert.equal(f.root.root.findByProps({ type: 'file' }).props.disabled, false)
})

test('leaving the portrait editor prevents a late upload from resurrecting its draft', async t => {
  const f = await fixture(t)
  await act(async () => f.root.update(null))
  await f.complete()
  assert.equal(f.changes.length, 0)
})
