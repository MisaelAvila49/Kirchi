//! Componentes fuertemente conexas de un grafo dirigido (Tarjan, sin recursión: una cadena de miles de compuertas no agota
//! la pila). Las usan el arranque de la lógica (los modelos en orden topológico, con cada lazo junto) y el reparto en islas
//! del simulador mixto (las islas que se influyen en ciclo se juntan).

/// Las componentes de `adj` (aristas de cada vértice) en orden topológico: si hay una arista de una componente A a otra B,
/// A va antes que B. Dentro de cada componente los vértices van en orden creciente.
pub fn componentes_fuertes(adj: &[Vec<usize>]) -> Vec<Vec<usize>> {
    let n = adj.len();
    const SIN: usize = usize::MAX;
    let mut indice = vec![SIN; n];
    let mut bajo = vec![0usize; n];
    let mut en_pila = vec![false; n];
    let mut pila: Vec<usize> = Vec::new();
    let mut siguiente = 0usize;
    // Tarjan entrega las componentes en orden topológico inverso.
    let mut comps: Vec<Vec<usize>> = Vec::new();
    // Pila de llamadas: (vértice, siguiente arista por revisar).
    let mut llamadas: Vec<(usize, usize)> = Vec::new();
    for raiz in 0..n {
        if indice[raiz] != SIN {
            continue;
        }
        llamadas.push((raiz, 0));
        while let Some(&(v, i)) = llamadas.last() {
            if i == 0 && indice[v] == SIN {
                indice[v] = siguiente;
                bajo[v] = siguiente;
                siguiente += 1;
                pila.push(v);
                en_pila[v] = true;
            }
            if let Some(&w) = adj[v].get(i) {
                if let Some(l) = llamadas.last_mut() {
                    l.1 += 1;
                }
                if indice[w] == SIN {
                    llamadas.push((w, 0));
                } else if en_pila[w] {
                    bajo[v] = bajo[v].min(indice[w]);
                }
                continue;
            }
            llamadas.pop();
            if let Some(&(u, _)) = llamadas.last() {
                bajo[u] = bajo[u].min(bajo[v]);
            }
            if bajo[v] == indice[v] {
                let mut c = Vec::new();
                loop {
                    let w = pila.pop().expect("el vértice raíz sigue en la pila");
                    en_pila[w] = false;
                    c.push(w);
                    if w == v {
                        break;
                    }
                }
                c.sort_unstable();
                comps.push(c);
            }
        }
    }
    comps.reverse();
    comps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ciclos_juntos_y_en_orden_topologico() {
        // 0 → 1 → 2 → 1 (ciclo 1-2), 2 → 3, 4 aislado, 5 → 0.
        let adj = vec![vec![1], vec![2], vec![1, 3], vec![], vec![], vec![0]];
        let c = componentes_fuertes(&adj);
        let pos = |v: usize| c.iter().position(|x| x.contains(&v)).unwrap();
        assert!(c.contains(&vec![1, 2]));
        assert_eq!(c.len(), 5);
        assert!(pos(5) < pos(0) && pos(0) < pos(1) && pos(1) < pos(3));
    }

    #[test]
    fn una_cadena_larga_no_agota_la_pila() {
        let n = 200_000;
        let adj: Vec<Vec<usize>> = (0..n).map(|k| if k + 1 < n { vec![k + 1] } else { vec![] }).collect();
        let c = componentes_fuertes(&adj);
        assert_eq!(c.len(), n);
        assert!(c.iter().enumerate().all(|(k, x)| x == &vec![k]));
    }
}
