/*
 * Compatibility wrappers.
 *
 * Existing popup save code can continue using
 * getVaultHandle(), while vault-store.js now owns
 * the actual multi-vault implementation.
 */

async function setVaultHandle(handle) {
  return ClipNestVaultStore.addVault(
    handle
  );
}

async function getVaultHandle() {
  return ClipNestVaultStore.getVaultHandle();
}

async function clearVaultHandle() {
  const id =
    await ClipNestVaultStore
      .getActiveVaultId();

  if (id) {
    await ClipNestVaultStore
      .removeVault(id);
  }
}
