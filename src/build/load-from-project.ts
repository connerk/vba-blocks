import dedent from 'dedent/macro';
import { CliError, ErrorCode } from '../errors';
import { Manifest } from '../manifest';
import { Reference } from '../manifest/reference';
import { Project } from '../project';
import { joinCommas } from '../utils/text';
import { BuildGraph, FromDependences } from './build-graph';
import { byComponentName, Component } from './component';

export default async function loadFromProject(
  project: Project,
  dependencies: Manifest[]
): Promise<BuildGraph> {
  const manifests = [project.manifest, ...dependencies];
  const loading_components: Promise<Component>[] = [];
  const references: Reference[] = [];
  const found_references: { [name_guid: string]: boolean } = {};
  const from_dependencies: FromDependences = { components: new Map(), references: new Map() };

  // Load components and references from project and dependencies
  for (const manifest of manifests) {
    for (const source of manifest.src) {
      loading_components.push(
        Component.load(source.path, { binary_path: source.binary }).then(component => {
          if (manifest !== project.manifest) {
            from_dependencies.components.set(component, manifest.name);
          }

          return component;
        })
      );
    }
    for (const reference of manifest.references) {
      const name_guid = `${reference.name}_${reference.guid}`;
      if (found_references[name_guid]) continue;

      references.push(reference);
      if (manifest !== project.manifest) {
        from_dependencies.references.set(reference, manifest.name);
      }

      found_references[name_guid] = true;
    }
  }

  const components = (await Promise.all(loading_components)).sort(byComponentName);
  const graph = { name: 'VBAProject', components, references, from_dependencies };

  validateGraph(project, graph);
  return graph;
}

function validateGraph(project: Project, graph: BuildGraph) {
  const components_by_name: { [name: string]: string[] } = {};
  const references_by_name: { [name: string]: Reference[] } = {};
  const errors = [];

  for (const component of graph.components) {
    if (!components_by_name[component.name]) components_by_name[component.name] = [];

    const manifest_name =
      graph.from_dependencies.components.get(component) || project.manifest.name;
    components_by_name[component.name].push(manifest_name);
  }
  for (const reference of graph.references) {
    if (!references_by_name[reference.name]) references_by_name[reference.name] = [];
    references_by_name[reference.name].push(reference);
  }

  for (const [name, from] of Object.entries(components_by_name)) {
    if (from.length > 1) {
      const names = from.map(name => `"${name}"`);
      errors.push(`Source "${name}" is present in manifests named ${joinCommas(names)}`);
    }
  }
  for (const [name, references] of Object.entries(references_by_name)) {
    if (references.length > 1) {
      const versions = references.map(reference => `${reference.major}.${reference.minor}`);
      errors.push(`Reference "${name}" has multiple versions: ${joinCommas(versions)}`);
    }
  }

  if (errors.length) {
    throw new CliError(
      ErrorCode.BuildInvalid,
      dedent`
        Invalid build:

        ${errors.join('\n')}
      `
    );
  }
}
