# Registro de los agentes

Una vez cada 6 horas, GitHub abre Core en un navegador y hace trabajar a ALPHA, BETA y GAMMA.
Lo que hacen queda guardado en el repo, en la rama `registro`. Tú no tienes que hacer nada.

```
  GitHub Actions (cada 6 h)
          |
          v
  Abre la web de Core ---> ALPHA, BETA y GAMMA trabajan
                                   |
                                   v
                    Rama "registro": registro/ultimo.json
                                   |
                                   v
                      Instinct lo lee y te avisa
```

## Que se guarda

- `registro/ultimo.json`: el informe de la ultima vez. Veredicto `OK`, `PARCIAL` o `CON_ERRORES`.
- `registro/actividad-AAAA-MM-DD.json`: el mismo informe, uno por dia.
- `registro/ultima-captura.png`: captura de la web al terminar.

El informe incluye los eventos del Registro de actividad, cada llamada al modelo (tiempo y error si lo hay) y los errores de la pagina.

## Que NO es

Es una sesion de prueba en el servidor de GitHub. No es el registro de tu navegador, que sigue guardado solo en tu PC.
No hay claves ni secretos. Usa el permiso que GitHub da a la Action y escribe solo en la rama `registro`, asi no lanza otras pruebas ni vuelve a publicar la web.

## Lanzarlo a mano

En GitHub: Actions > "Registro de agentes" > Run workflow.

## Quitarlo

Borra `.github/workflows/agentes-log.yml`, `scripts/log-agentes.mjs` y la rama `registro`. La app no cambia.
