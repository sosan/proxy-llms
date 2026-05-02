# SPDD - Structured Prompt-Driven Development

## ¿Qué es SPDD?

Structured Prompt-Driven Development (SPDD) es un método de ingeniería que trata los prompts como artefactos de primera clase en el desarrollo de software. En lugar de depender de chats ad hoc, SPDD convierte los prompts en activos que pueden ser:

- ✅ Versionados y controlados
- ✅ Revisados por el equipo
- ✅ Reutilizados entre proyectos
- ✅ Mejorados iterativamente

## Componentes Principales

### 1. REASONS Canvas
Estructura de 7 partes que guía un prompt desde la intención hasta la ejecución:

- **R** - Requirements: ¿Qué problema resolvemos y cuál es la definición de terminado?
- **E** - Entities: Entidades del dominio y sus relaciones
- **A** - Approach: Estrategia de cómo cumplir los requisitos
- **S** - Structure: Dónde encaja el cambio en el sistema
- **O** - Operations: Descomposición en pasos concretos e implementables
- **N** - Norms: Normas de ingeniería transversales
- **S** - Safeguards: Límites no negociables

### 2. Workflow SPDD
El workflow trae los prompts a la misma disciplina que el código:

1. **Crear historia de usuario** → `spdd-story`
2. **Análisis estratégico** → `spdd-analysis`
3. **Generar canvas REASONS** → `spdd-reasons-canvas`
4. **Generar código** → `spdd-generate`
5. **Actualizar/sincronizar** → `spdd-prompt-update` / `spdd-sync`

## Comandos Disponibles

### CLI
Crear historias de usuario

```bash
python spdd_cli.py spdd-story "texto del requerimiento"
```

Generar análisis

python spdd_cli.py spdd-analysis archivo_historia.md

Crear canvas REASONS

python spdd_cli.py spdd-reasons-canvas archivo_analisis.md

Generar código

python spdd_cli.py spdd-generate archivo_canvas.md

Actualizar canvas

python spdd_cli.py spdd-prompt-update archivo_canvas.md --update "instrucción"

Sincronizar cambios de código

python spdd_cli.py spdd-sync archivo_canvas.md --update "cambios de código"
### Web Interface
### Web Interface
bash
Lanzar interfaz web

streamlit run spdd_web.py
## Ejemplo de Uso

### 1. Crear Historia de Usuario
## Ejemplo de Uso

### 1. Crear Historia de Usuario
bash
python spdd_cli.py spdd-story "Necesitamos implementar facturación multi-plan con precios basados en modelo para nuestro servicio de IA"
### 2. Generar Análisis
### 2. Generar Análisis
bash
python spdd_cli.py spdd-analysis spdd/stories/STORY-20241220120000.md --codebase ./src
### 3. Crear Canvas REASONS
### 3. Crear Canvas REASONS
bash
python spdd_cli.py spdd-reasons-canvas spdd/analysis/ANALYSIS-20241220120500.md
### 4. Generar Código
### 4. Generar Código
bash
python spdd_cli.py spdd-generate spdd/canvas/CANVAS-20241220121000.md
## Beneficios Clave

### Inmediatos
- ✅ **Determinismo**: Especificación precisa reduce alucinaciones
- ✅ **Trazabilidad**: Cada cambio rastreable al prompt estructurado
- ✅ **Revisiones más rápidas**: Código llega más cerca de estándares

### A Corto Plazo
- ✅ **Explicabilidad**: Intención visible a nivel de lenguaje natural
- ✅ **Evolución más segura**: Límites bien definidos

### A Largo Plazo
- ✅ **Activos reutilizables**: Biblioteca de prompts exitosos
- ✅ **Consistencia del equipo**: Mismo proceso para todos

## Tres Habilidades Clave

### 1. Abstraction First
Diseño antes de generar. Claridad sobre objetos, colaboraciones y límites.

### 2. Alignment
Bloquear intención antes de escribir código. Hacer explícito "qué haremos/qué no haremos".

### 3. Iterative Review
Convertir output en un bucle controlado. Proceso de ingeniería, no borrador único.

## Cuándo Usar SPDD

### ⭐⭐⭐⭐⭐ Altamente Recomendado
- Entrega escalada y estandarizada
- Alta compliance y restricciones duras
- Colaboración en equipo y auditabilidad

### ⭐⭐⭐⭐☆ Recomendado
- Trabajo de consistencia transversal
- Refactors complejos

### ⭐⭐☆☆☆ Casos Limitados
- Hotfixes de emergencia
- Spikes exploratorios
- Scripts de un solo uso

### ⭐☆☆☆☆ No Recomendado
- Dominios mal definidos
- Trabajo puramente creativo/visual

## Estructura de Archivos
## Beneficios Clave

### Inmediatos
- ✅ **Determinismo**: Especificación precisa reduce alucinaciones
- ✅ **Trazabilidad**: Cada cambio rastreable al prompt estructurado
- ✅ **Revisiones más rápidas**: Código llega más cerca de estándares

### A Corto Plazo
- ✅ **Explicabilidad**: Intención visible a nivel de lenguaje natural
- ✅ **Evolución más segura**: Límites bien definidos

### A Largo Plazo
- ✅ **Activos reutilizables**: Biblioteca de prompts exitosos
- ✅ **Consistencia del equipo**: Mismo proceso para todos

## Tres Habilidades Clave

### 1. Abstraction First
Diseño antes de generar. Claridad sobre objetos, colaboraciones y límites.

### 2. Alignment
Bloquear intención antes de escribir código. Hacer explícito "qué haremos/qué no haremos".

### 3. Iterative Review
Convertir output en un bucle controlado. Proceso de ingeniería, no borrador único.

## Cuándo Usar SPDD

### ⭐⭐⭐⭐⭐ Altamente Recomendado
- Entrega escalada y estandarizada
- Alta compliance y restricciones duras
- Colaboración en equipo y auditabilidad

### ⭐⭐⭐⭐☆ Recomendado
- Trabajo de consistencia transversal
- Refactors complejos

### ⭐⭐☆☆☆ Casos Limitados
- Hotfixes de emergencia
- Spikes exploratorios
- Scripts de un solo uso

### ⭐☆☆☆☆ No Recomendado
- Dominios mal definidos
- Trabajo puramente creativo/visual

## Estructura de Archivos

spdd/
├── canvas/ # Canvas REASONS generados
├── stories/ # Historias de usuario
├── analysis/ # Análisis estratégicos
└── commands.py # Comandos SPDD

generated/ # Código generado
spdd_cli.py # CLI
spdd_web.py # Interfaz web
## Próximos Pasos

1. **Instalar dependencias**: `pip install litai streamlit`
2. **Probar CLI**: Ejecutar primer comando `spdd-story`
3. **Usar interfaz web**: `streamlit run spdd_web.py`
4. **Iterar y mejorar**: Refinar prompts basado en resultados

El objetivo es hacer que los cambios asistidos por IA sean gobernables, revisables y reutilizables, para que los equipos sean más rápidos Y más seguros.
## Próximos Pasos

1. **Instalar dependencias**: `pip install litai streamlit`
2. **Probar CLI**: Ejecutar primer comando `spdd-story`
3. **Usar interfaz web**: `streamlit run spdd_web.py`
4. **Iterar y mejorar**: Refinar prompts basado en resultados

El objetivo es hacer que los cambios asistidos por IA sean gobernables, revisables y reutilizables, para que los equipos sean más rápidos Y más seguros.
