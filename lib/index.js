// dsh-file-actions — host half.
//
// The whole feature lives in the browser half: it reuses the Session Remote
// (`session.openWorkspacePath` / `session.workspacePathApplications`) and the
// workspace-files Remote (`stat` / `readBytes`) that the shipped Web bundle
// already serves. Nothing here touches the filesystem or the desktop, so this
// module only satisfies the bundle row and declares its identity.

export const name = 'dsh-file-actions'

export const inject = []

export function apply() {}
