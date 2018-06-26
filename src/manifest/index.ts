import { join, normalize } from '../utils/path';
import { parse as parseToml } from '../utils/toml';
import { pathExists, readFile } from '../utils/fs';
import { manifestNotFound } from '../errors';
import { Version } from './version';
import { Source, parseSrc } from './source';
// TODO #features
// import { Feature, parseFeatures } from './feature';
import { Dependency, parseDependencies } from './dependency';
import { Reference, parseReferences } from './reference';
import { Target, parseTargets } from './target';
import { manifestOk, manifestInvalid } from '../errors';

export {
  Version,
  Source,
  // TODO #features
  // Feature,
  Dependency,
  Reference,
  Target
};

/**
 * @example
 * ```toml
 * [package]
 * name = "package-name"
 * version = "1.0.0-rc.1"
 * authors = ["Tim Hall <tim.hall.engr@gmail.com> (https://github.com/timhall)"]
 *
 * [src]
 * A = "src/a.bas"
 * B = { path = "src/b.cls" }
 * C = { path = "src/c.frm", optional = true }
 *
 * [dependencies]
 * dictionary = "v1.4.1"
 * with-properties = { version = "1.0.0" }
 * from-path = { path = "packages/from-path" }
 * from-git-master = { git = "https://github.com/VBA-tools/VBA-Web.git" }
 * from-git-branch = { git = "https://github.com/VBA-tools/VBA-Web.git", branch = "beta" }
 * from-git-tag = { git = "https://github.com/VBA-tools/VBA-Web.git", tag = "v1.0.0" }
 * from-git-rev = { git = "https://github.com/VBA-tools/VBA-Web.git", rev = "a1b2c3d4" }
 *
 * # [references.Scripting]
 * # version = "1.0"
 * # guid = "{420B2830-E718-11CF-893D-00A0C9054228}"
 *
 * [targets]
 * xlsm = "targets/xlsm"
 *
 * [targets.xlam]
 * name = "custom-name"
 * path = "targets/xlam"
 * ```
 */

export interface Snapshot {
  name: string;
  version: Version;
  dependencies: Dependency[];
}

export interface Metadata {
  authors: string[];
  publish: boolean;
  [name: string]: any;
}

export interface Manifest extends Snapshot {
  package?: Metadata;
  project?: Metadata;
  src: Source[];
  references: Reference[];
  targets: Target[];
  dir: string;

  // TODO #features
  // features: Feature[];
  // defaultFeatures: string[];
}

const EXAMPLE = `Example vba-block.toml for a package (e.g. library to be shared):

  [package]
  name = "my-package"
  version = "0.0.0"
  authors = ["..."]

Example vba-block.toml for a project (e.g. workbomanifestOk, document, etc.):

  [project]
  name = "my-project"
  version = "0.0.0"
  authors = ["..."]`;

export function parseManifest(value: any, dir: string): Manifest {
  manifestOk(
    value && (value.package || value.project),
    `[package] or [project] is required, with name, version, and authors specified. ${EXAMPLE}`
  );

  let name, version, authors, publish;
  if (value.project) {
    name = value.project.name;
    version = value.project.version || '0.0.0';
    authors = value.project.authors || [];
    publish = false;

    manifestOk(name, `[project] name is a required field. ${EXAMPLE}`);
  } else {
    name = value.package.name;
    version = value.package.version;
    authors = value.package.authors;
    publish = value.package.publish || false;

    manifestOk(name, `[package] name is a required field. ${EXAMPLE}`);
    manifestOk(version, `[package] version is a required field. ${EXAMPLE}`);
    manifestOk(authors, `[package] authors is a required field. ${EXAMPLE}`);
  }

  const src = parseSrc(value.src || {}, dir);
  const dependencies = parseDependencies(value.dependencies || {}, dir);
  const references = parseReferences(value.references || {});
  const targets = parseTargets(value.targets || {}, name, dir);

  // TODO #features
  // const { features, defaultFeatures } = parseFeatures(value.features || {});

  let pkg, project;
  if (value.project) {
    project = { version, authors, publish, ...value.project };
  } else {
    pkg = { publish, ...value.package };
  }

  return {
    name,
    version,
    package: pkg,
    project,
    src,
    dependencies,
    references,
    targets,
    dir

    // TODO #features
    // features,
    // defaultFeatures,
  };
}

export async function loadManifest(dir: string): Promise<Manifest> {
  const file = join(dir, 'vba-block.toml');

  if (!(await pathExists(file))) {
    throw manifestNotFound(dir);
  }

  const raw = await readFile(file);

  let parsed;
  try {
    parsed = parseToml(raw.toString());
  } catch (err) {
    const message = `Syntax Error: ${file} (${err.line}:${err.column})\n\n${
      err.message
    }`;
    throw manifestInvalid(message);
  }

  const manifest = parseManifest(parsed, normalize(dir));

  return manifest;
}
