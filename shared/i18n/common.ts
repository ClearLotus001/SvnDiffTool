export type MessageMap = Record<string, string>;
export type TranslationParamValue = number | string;
export type RuntimeTranslationParams = Record<string, TranslationParamValue>;
export type AssertTrue<T extends true> = T;

type ParamKeyMap = Partial<Record<PropertyKey, readonly PropertyKey[]>>;

export type LocaleKeyParity<A extends MessageMap, B extends MessageMap> =
  [
    Exclude<keyof A, keyof B>,
    Exclude<keyof B, keyof A>,
  ] extends [never, never]
    ? true
    : never;

export type ParamNamesForKeyMap<
  KeyMap extends ParamKeyMap,
  K extends PropertyKey,
> = K extends keyof KeyMap
  ? KeyMap[K] extends readonly (infer ParamName extends PropertyKey)[]
    ? ParamName
    : never
  : never;

export type TranslationParamsForKeyMap<
  KeyMap extends ParamKeyMap,
  K extends PropertyKey,
> = Record<Extract<ParamNamesForKeyMap<KeyMap, K>, string>, TranslationParamValue>;

export type TranslationArgsForKeyMap<
  KeyMap extends ParamKeyMap,
  K extends PropertyKey,
> = keyof TranslationParamsForKeyMap<KeyMap, K> extends never
  ? []
  : [params: TranslationParamsForKeyMap<KeyMap, K>];

export function coerceMessages<T extends MessageMap>(value: T, errorMessage: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(errorMessage);
  }
  for (const entry of Object.values(value)) {
    if (typeof entry !== 'string') {
      throw new Error(errorMessage);
    }
  }
  return value;
}

function formatMessage(template: string, params: RuntimeTranslationParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function translateMessage<K extends string>(
  messages: Record<K, string>,
  key: K,
  params: RuntimeTranslationParams = {},
): string {
  return formatMessage(messages[key] ?? key, params);
}

export function collectPlaceholderMap(messages: MessageMap): Record<string, readonly string[]> {
  const entries = Object.entries(messages)
    .map(([key, value]) => {
      const params = [...value.matchAll(/\{(\w+)\}/g)]
        .map((match) => match[1])
        .filter((param): param is string => typeof param === 'string');
      const uniqueParams = [...new Set(params)];
      return [key, uniqueParams] as const;
    })
    .filter(([, params]) => params.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries);
}

export function renderParamKeySource(
  constName: string,
  sourcePath: string,
  paramMap: Record<string, readonly string[]>,
): string {
  const lines = [
    `// Generated from ${sourcePath}`,
    '// Run `npm run generate:i18n-param-keys` after editing locale placeholders.',
    `export const ${constName} = {`,
  ];

  for (const [key, params] of Object.entries(paramMap)) {
    const renderedParams = params.map((param) => JSON.stringify(param)).join(', ');
    lines.push(`  ${JSON.stringify(key)}: [${renderedParams}],`);
  }

  lines.push('} as const;');
  lines.push('');
  return lines.join('\n');
}
