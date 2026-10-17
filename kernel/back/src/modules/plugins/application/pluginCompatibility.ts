import { CORE_VERSION } from '../domain/coreVersion.js';
import { dependencyId, dependencyRange } from '../domain/pluginDependency.js';
import { satisfiesRange } from '../domain/semverRange.js';
import type { PluginManifest } from '../domain/contracts.js';

export type CompatibilityErrorCode =
  | 'core_engine_mismatch'
  | 'dependency_missing'
  | 'dependency_version_mismatch'
  | 'missing_from_disk';

export type CompatibilityError = {
  code: CompatibilityErrorCode;
  message: string;
  dependencyId?: string;
};

export type PluginCompatibility = {
  ok: boolean;
  errors: CompatibilityError[];
};

export type CompatibilitySubject = {
  id: string;
  manifest: Pick<PluginManifest, 'version' | 'engines' | 'dependsOn'>;
};

/** Whether `plugin` may run on this kernel with the given catalogue. */
export function assessPluginCompatibility(
  plugin: CompatibilitySubject,
  catalogue: readonly CompatibilitySubject[],
  coreVersion: string = CORE_VERSION,
): PluginCompatibility {
  const errors: CompatibilityError[] = [];
  const coreRange = plugin.manifest.engines?.core;
  if (coreRange && !satisfiesRange(coreVersion, coreRange)) {
    errors.push({
      code: 'core_engine_mismatch',
      message: `Plugin ${plugin.id} ${plugin.manifest.version} requires core ${coreRange}; this kernel is ${coreVersion}.`,
    });
  }
  const byId = new Map(catalogue.map((entry) => [entry.id, entry]));
  for (const dep of plugin.manifest.dependsOn ?? []) {
    const id = dependencyId(dep);
    const range = dependencyRange(dep);
    const parent = byId.get(id);
    if (!parent) {
      errors.push({
        code: 'dependency_missing',
        message: `Plugin ${plugin.id} depends on ${id}, which is not installed.`,
        dependencyId: id,
      });
      continue;
    }
    if (range && !satisfiesRange(parent.manifest.version, range)) {
      errors.push({
        code: 'dependency_version_mismatch',
        message: `Plugin ${plugin.id} needs ${id} ${range}; installed ${id} is ${parent.manifest.version}.`,
        dependencyId: id,
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
