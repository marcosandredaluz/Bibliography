"""Servidor HTTP simulado para Crossref, PubMed, OpenAlex e páginas web, com falhas programadas.

Uso: python3 servidor_simulado.py 8765
O motor deve aceitar as variáveis de ambiente:
  AUDITOR_CROSSREF_URL=http://127.0.0.1:8765/crossref
  AUDITOR_PUBMED_URL=http://127.0.0.1:8765/pubmed
  AUDITOR_OPENALEX_URL=http://127.0.0.1:8765/openalex
  AUDITOR_HTTP_TIMEOUT_MS=5000
GET /__estatisticas devolve quantas requisições cada cenário recebeu.
"""
import collections, json, sys, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONT = collections.Counter()
TRAVA = threading.Lock()


def obra(doi, titulo, ano=2020):
    return {'message': {'DOI': doi, 'title': [titulo], 'issued': {'date-parts': [[ano]]},
                        'published-print': {'date-parts': [[ano]]}, 'container-title': ['Revista Simulada'],
                        'volume': '1', 'issue': '1', 'page': '1-10', 'author': [{'family': 'Silva', 'given': 'Ana'}]}}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def responder(self, cod, corpo=b'', tipo='application/json', extra=None):
        self.send_response(cod)
        self.send_header('Content-Type', tipo)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if corpo:
            self.wfile.write(corpo if isinstance(corpo, bytes) else corpo.encode())

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == '/__estatisticas':
            return self.responder(200, json.dumps(CONT))
        if u.path.startswith('/crossref/works/'):
            doi = urllib.parse.unquote(u.path[len('/crossref/works/'):]).lower()
            cen = doi.split('rede.')[-1] if 'rede.' in doi else ''
            with TRAVA:
                CONT[cen] += 1; n = CONT[cen]
            if cen == 'ok':
                return self.responder(200, json.dumps(obra(doi, 'Obra disponível')))
            if cen == '429-uma-vez':
                if n == 1:
                    return self.responder(429, '{}', extra={'Retry-After': '1'})
                return self.responder(200, json.dumps(obra(doi, 'Obra após limite de taxa')))
            if cen == '429-sempre':
                return self.responder(429, '{}', extra={'Retry-After': '1'})
            if cen == '500-duas-vezes':
                if n <= 2:
                    return self.responder(500, '{}')
                return self.responder(200, json.dumps(obra(doi, 'Obra após erro do servidor')))
            if cen == 'lento':
                time.sleep(30)
                return self.responder(200, json.dumps(obra(doi, 'Obra lenta')))
            if cen == 'json-quebrado':
                return self.responder(200, '{"message": {"DOI": ')
            return self.responder(404, 'Resource not found.', tipo='text/plain')
        if u.path.startswith('/crossref/works'):
            with TRAVA:
                CONT['crossref-busca'] += 1
            return self.responder(200, json.dumps({'message': {'items': []}}))
        if u.path.startswith('/pubmed/esearch'):
            termo = ' '.join(q.get('term', [''])).lower()
            with TRAVA:
                CONT['pubmed-busca'] += 1
            ids = ['18634202'] if 'updated guidelines for evaluating public health surveillance' in termo else []
            return self.responder(200, json.dumps({'esearchresult': {'count': str(len(ids)), 'idlist': ids}}))
        if u.path.startswith('/pubmed/esummary'):
            return self.responder(200, json.dumps({'result': {'uids': ['18634202'], '18634202': {
                'uid': '18634202', 'title': 'Updated guidelines for evaluating public health surveillance systems: recommendations from the Guidelines Working Group.',
                'source': 'MMWR Recomm Rep', 'pubdate': '2001 Jul 27', 'authors': [{'name': 'German RR'}]}}}))
        if u.path.startswith('/openalex/works'):
            with TRAVA:
                CONT['openalex-busca'] += 1
            return self.responder(200, json.dumps({'results': []}))
        if u.path == '/web/pagina-ok':
            return self.responder(200, '<html><body><h1>Página institucional</h1></body></html>', tipo='text/html')
        return self.responder(404, 'não encontrado', tipo='text/plain')


if __name__ == '__main__':
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(('127.0.0.1', porta), H).serve_forever()
