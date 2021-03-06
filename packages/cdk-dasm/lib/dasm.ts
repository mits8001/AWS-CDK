import { CodeMaker, toCamelCase } from 'codemaker';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const mkdtemp = promisify(fs.mkdtemp);
const readFile = promisify(fs.readFile);

interface ConstructDefinition {
  namespace: string;
  className: string;
  id: string;
  props: { [key: string]: any };
}

export interface DisassemblerOptions {
  /**
   * Include a timestamp in the generated output.
   *
   * @default true
   */
  readonly timestamp?: boolean;
}

export async function dasmTypeScript(template: Template, options: DisassemblerOptions = {}) {
  const definitions = new Array<ConstructDefinition>();

  for (const [ id, resource ] of Object.entries(template.Resources || {})) {
    const type = resource.Type;
    const props = resource.Properties || {};

    definitions.push({
      id,
      ...toCfnClassName(type),
      props: capitalizeKeys(props)
    });
  }

  const code = new CodeMaker();

  const outFile = 'out.ts';

  code.openFile(outFile);

  const timestamp = options.timestamp !== undefined ? options.timestamp : true;
  const suffix = timestamp ?  `at ${new Date().toISOString()}` : '';

  code.line(`// generated by cdk-dasm ${suffix}`);
  code.line();

  //
  // imports
  //

  code.line(`import { Stack, StackProps, Fn } from '@aws-cdk/core';`);
  code.line(`import { Construct } from 'constructs';`);

  for (const ns of getUniqueNamespaces(definitions)) {
    const importName = `@aws-cdk/aws-${ns}`;
    code.line(`import ${ns} = require('${importName}');`);
  }

  code.line();

  //
  // stack
  //

  code.openBlock(`export class MyStack extends Stack`);
  code.openBlock(`constructor(scope: Construct, id: string, props: StackProps = {})`);
  code.line(`super(scope, id, props);`);

  for (const def of definitions) {

    // no props
    if (Object.keys(def.props).length === 0) {
      code.line(`new ${def.className}(this, '${def.id}');`);
      continue;
    }

    code.indent(`new ${def.className}(this, '${def.id}', {`);

    for (const [key, value] of Object.entries(def.props)) {
      const json = JSON.stringify(value, undefined, 2);
      const [ first, ...rest ] = json.split('\n');

      if (rest.length === 0) {
        code.line(`${key}: ${first},`); // single line
      } else {
        code.line(`${key}: ${first}`);
        rest.forEach((r, i) => {
          code.line(r + ((i === rest.length - 1) ? ',' : ''));
        });
      }
    }

    code.unindent('});');
  }

  code.closeBlock();

  code.closeBlock(' // MyStack');

  code.closeFile(outFile);

  const workdir = await mkdtemp(path.join(os.tmpdir(), 'cdk-dasm-typescript'));
  await code.save(workdir);

  return (await readFile(path.join(workdir, outFile))).toString();
}

function capitalizeKeys(x: any): any {
  if (typeof(x) === 'function') {
    throw new Error(`function?`);
  }

  if (Array.isArray(x)) {
    return x.map(i => capitalizeKeys(i));
  }

  if (typeof(x) === 'object') {
    const ret: { [key: string]: any } = {};
    for (const [ key, value ] of Object.entries(x)) {
      let newKey;
      if (key === 'Ref' || key.startsWith('Fn::')) {
        newKey = key;
      } else {
        newKey = toCamelCase(key);
      }

      ret[newKey] = capitalizeKeys(value);
    }
    return ret;
  }

  // primitive
  return x;
}

function toCfnClassName(resourceType: string) {
  const [ , namespace, type ] = resourceType.split('::');
  const className = `${namespace.toLocaleLowerCase()}.Cfn${type}`;
  return { namespace: namespace.toLocaleLowerCase(), className };
}

function getUniqueNamespaces(definitions: Array<ConstructDefinition>): String[] {
  return [... new Set(definitions.map(definition => definition.namespace))];
}

interface Template {
  Resources: { [id: string]: Resource };
}

interface Resource {
  Type: string;
  Properties?: { [prop: string]: any }
}
