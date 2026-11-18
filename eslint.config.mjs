/* eslint-config-next 16 ja exporta configuracao plana por subcaminho: nao precisa
   mais do compatibilizador do eslintrc, que quebrava ao validar o esquema antigo. */
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

export default [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
];
