Attribute VB_Name = "modBibliografiaWord"
Option Explicit

Private Const API_BASE_URL As String = "http://127.0.0.1:23119/api/word"
Private Const TIMEOUT_SEGUNDOS As Long = 20

' Modos de Citação: "campos" (w:fldSimple / wdFieldAddin Zotero) ou "bookmarks" (ZOTERO_BREF_... Mendeley)
Private Const CHAVE_MODO_CITACAO As String = "ModoCincoBibliografia"

' ==============================================================================
' 1. CALLBACKS DA FAIXA DE OPÇÕES (RIBBON UI)
' ==============================================================================

Public Sub Ribbon_TestarConexao(control As IRibbonControl)
    On Error GoTo TratarErro
    Dim resposta As String
    Dim statusCod As Long
    
    resposta = EnviarRequisicaoHttp("GET", API_BASE_URL & "/ping", "", statusCod)
    
    If statusCod = 200 Then
        MsgBox "✓ Conexão com o Motor Local estabelecida com sucesso!" & vbCrLf & vbCrLf & _
               "• Servidor: 127.0.0.1:23119 (FastAPI Engine)" & vbCrLf & _
               "• Formato de Citações: " & ObterModoCitacao() & vbCrLf & _
               "• Diagnóstico Visual: Ativado (Grifos em Cores + Comentários Nativos)", _
               vbInformation, "Bibliografia Forense Word"
    Else
        MsgBox "O motor local respondeu com erro (HTTP " & statusCod & "):" & vbCrLf & resposta, _
               vbExclamation, "Aviso"
    End If
    Exit Sub

TratarErro:
    MsgBox "Não foi possível conectar ao Motor Local na porta 23119." & vbCrLf & _
           "Verifique se o processo BibliografiaWordEngine.exe está em execução." & vbCrLf & vbCrLf & _
           "Detalhes técnicos: " & Err.Description, vbCritical, "Erro de Conexão"
End Sub

Public Sub Ribbon_AuditarManuscrito(control As IRibbonControl)
    ExecutarAuditoriaComportamentoDuplo "todos"
End Sub

Public Sub Ribbon_ChecarEstiloIa(control As IRibbonControl)
    ExecutarAuditoriaComportamentoDuplo "estilo_ia"
End Sub

Public Sub Ribbon_ChecarCitacoesOrfas(control As IRibbonControl)
    ExecutarAuditoriaComportamentoDuplo "chamadas"
End Sub

Public Sub Ribbon_InserirCitacao(control As IRibbonControl)
    On Error GoTo TratarErro
    Dim resposta As String
    Dim statusCod As Long
    Dim termoBusca As String
    Dim modo As String
    
    modo = ObterModoCitacao()
    termoBusca = Trim(Selection.Text)
    
    Application.StatusBar = "Consultando catálogo de referências no motor local..."
    resposta = EnviarRequisicaoHttp("POST", API_BASE_URL & "/seletor-citacao", _
                                   "{""termo"": " & EscaparJson(termoBusca) & ", ""modo"": " & EscaparJson(modo) & "}", statusCod)
    Application.StatusBar = ""
    
    If statusCod = 200 And Len(Trim(resposta)) > 0 Then
        ' Insere de acordo com o modo escolhido (Campos Word ou Bookmarks)
        InserirCitacaoHibrida resposta, modo
    Else
        MsgBox "Nenhuma citação foi selecionada ou motor indisponível.", vbInformation, "Citações"
    End If
    Exit Sub
TratarErro:
    Application.StatusBar = ""
    MsgBox "Erro ao inserir citação: " & Err.Description, vbCritical, "Erro"
End Sub

Public Sub Ribbon_InserirBibliografia(control As IRibbonControl)
    On Error GoTo TratarErro
    Dim resposta As String
    Dim statusCod As Long
    
    Application.StatusBar = "Gerando lista final de referências conforme ABNT / Vancouver..."
    resposta = EnviarRequisicaoHttp("GET", API_BASE_URL & "/gerar-bibliografia", "", statusCod)
    Application.StatusBar = ""
    
    If statusCod = 200 Then
        Dim rng As Range
        Set rng = ActiveDocument.Content
        rng.Collapse wdCollapseEnd
        
        ' Cria ou atualiza marcador específico de bibliografia
        If ActiveDocument.Bookmarks.Exists("BIBLIOGRAFIA_REFERENCIAS_FINAL") Then
            ActiveDocument.Bookmarks("BIBLIOGRAFIA_REFERENCIAS_FINAL").Range.Text = resposta
        Else
            rng.InsertParagraphAfter
            rng.InsertAfter vbCrLf & "REFERÊNCIAS" & vbCrLf
            rng.Collapse wdCollapseEnd
            rng.Text = resposta
            ActiveDocument.Bookmarks.Add "BIBLIOGRAFIA_REFERENCIAS_FINAL", rng
        End If
        MsgBox "Lista de referências inserida/atualizada com sucesso no final do documento!", vbInformation, "Bibliografia"
    Else
        MsgBox "Falha ao gerar bibliografia: " & resposta, vbExclamation, "Aviso"
    End If
    Exit Sub
TratarErro:
    Application.StatusBar = ""
    MsgBox "Erro ao inserir referências: " & Err.Description, vbCritical, "Erro"
End Sub

Public Sub Ribbon_AlternarModoCitacao(control As IRibbonControl)
    Dim modoAtual As String
    modoAtual = ObterModoCitacao()
    
    If modoAtual = "campos" Then
        SalvarModoCitacao "bookmarks"
        MsgBox "Modo de Citação alterado para: TEXTO PURO COM BOOKMARKS (Padrão Mendeley/Zotero RTF)" & vbCrLf & _
               "Ideal para compartilhamento com Google Docs e LibreOffice.", vbInformation, "Configuração de Formato"
    Else
        SalvarModoCitacao "campos"
        MsgBox "Modo de Citação alterado para: CAMPOS NATIVOS DO WORD (w:fldSimple / wdFieldAddin)" & vbCrLf & _
               "Ideal para proteção contra edição acidental no Microsoft Word.", vbInformation, "Configuração de Formato"
    End If
End Sub

Public Sub Ribbon_LimparDestaques(control As IRibbonControl)
    If MsgBox("Deseja remover todos os grifos coloridos e comentários de auditoria do documento?", _
              vbYesNo + vbQuestion, "Limpar Destaques") = vbYes Then
        Application.ScreenUpdating = False
        ActiveDocument.Content.HighlightColorIndex = wdNoHighlight
        
        ' Remove comentários que foram criados pelo Auditor
        Dim c As Comment
        For Each c In ActiveDocument.Comments
            If InStr(c.Author, "Auditor") > 0 Or InStr(c.Author, "Bibliografia") > 0 Then
                c.Delete
            End If
        Next c
        Application.ScreenUpdating = True
        MsgBox "Destaques e comentários da auditoria limpos com sucesso.", vbInformation, "Limpeza Concluída"
    End If
End Sub

' ==============================================================================
' 2. AUDITORIA COM COMPORTAMENTO DUPLO: GRIFOS NO WORD + PAINEL DE DIAGNÓSTICO
' ==============================================================================

Private Sub ExecutarAuditoriaComportamentoDuplo(ByVal modulo As String)
    On Error GoTo TratarErro
    Dim doc As Document
    Dim textoDoc As String
    Dim payloadJson As String
    Dim resposta As String
    Dim statusCod As Long
    
    Set doc = ActiveDocument
    If doc Is Nothing Then Exit Sub
    
    textoDoc = doc.Content.Text
    If Len(Trim(textoDoc)) < 40 Then
        MsgBox "O documento precisa conter texto para ser auditado.", vbInformation, "Auditoria"
        Exit Sub
    End If
    
    Application.StatusBar = "Enviando manuscrito para auditoria no motor local (Anti-IA, Plágio & DOIs)..."
    Application.ScreenUpdating = False
    
    payloadJson = "{""texto"": " & EscaparJson(textoDoc) & ", ""modulo"": " & EscaparJson(modulo) & "}"
    resposta = EnviarRequisicaoHttp("POST", API_BASE_URL & "/auditar", payloadJson, statusCod)
    
    Application.ScreenUpdating = True
    Application.StatusBar = ""
    
    If statusCod = 200 Then
        ' Aplica grifos coloridos e comentários nativos no texto do Word
        ProcessarGrifosEComentarios doc, resposta
        
        ' Abre o Painel Lateral / Janela Web de Diagnóstico detalhado
        AbrirPainelDiagnosticoWeb
    Else
        MsgBox "Falha na auditoria (HTTP " & statusCod & "):" & vbCrLf & resposta, vbCritical, "Erro"
    End If
    Exit Sub

TratarErro:
    Application.ScreenUpdating = True
    Application.StatusBar = ""
    MsgBox "Erro durante a auditoria: " & Err.Description, vbCritical, "Falha"
End Sub

Private Sub ProcessarGrifosEComentarios(ByRef doc As Document, ByVal jsonRetorno As String)
    On Error Resume Next
    Dim totalAlertas As Long
    totalAlertas = 0
    
    ' Parser simplificado do JSON retornado para localizar parágrafos e trechos
    ' O motor devolve lista de alertas com: {tipo, paragrafo, trecho, mensagem, gravidade}
    Dim linhas() As String
    linhas = Split(jsonRetorno, "{""tipo"":")
    
    Dim i As Long
    For i = 1 To UBound(linhas)
        Dim bloco As String
        bloco = linhas(i)
        
        Dim tipo As String, msg As String, trecho As String, gravidade As String
        Dim numParagrafo As Long
        
        tipo = ExtrairCampoJson(bloco, "tipo")
        msg = ExtrairCampoJson(bloco, "mensagem")
        trecho = ExtrairCampoJson(bloco, "trecho")
        gravidade = ExtrairCampoJson(bloco, "gravidade")
        numParagrafo = Val(ExtrairCampoJson(bloco, "paragrafo"))
        
        If numParagrafo > 0 And numParagrafo <= doc.Paragraphs.Count Then
            Dim rngParagrafo As Range
            Set rngParagrafo = doc.Paragraphs(numParagrafo).Range
            
            Dim rngAlvo As Range
            Set rngAlvo = rngParagrafo
            
            ' Se especificou trecho, tenta encontrar exatamente o trecho no parágrafo
            If Len(trecho) >= 10 Then
                With rngParagrafo.Find
                    .ClearFormatting
                    .Text = Left(trecho, 60)
                    .Forward = True
                    .Wrap = wdFindStop
                    If .Execute Then
                        Set rngAlvo = rngParagrafo.Duplicate
                    End If
                End With
            End If
            
            ' 1. Aplica a cor do grifo conforme a gravidade e o tipo
            Select Case LCase(gravidade)
                Case "critica", "alta"
                    rngAlvo.HighlightColorIndex = wdRed ' Vermelho: Alucinação IA, DOI inexistente, plágio
                Case "media"
                    rngAlvo.HighlightColorIndex = wdYellow ' Amarelo: Citação órfã, divergência de página
                Case "estilo_ia"
                    rngAlvo.HighlightColorIndex = wdViolet ' Violeta: Clichê de redação artificial
                Case Else
                    rngAlvo.HighlightColorIndex = wdTurquoise
            End Select
            
            ' 2. Insere Comentário Nativo do Word com o diagnóstico e prompt de correção
            Dim novoComentario As Comment
            Set novoComentario = doc.Comments.Add(Range:=rngAlvo, Text:=msg & vbCrLf & vbCrLf & _
                                                 "🤖 Sugestão: Selecione este parágrafo e use a aba 'Bibliografia Forense' para reescrever com IA.")
            novoComentario.Author = "Auditor Forense"
            novoComentario.Initial = "IA"
            
            totalAlertas = totalAlertas + 1
        End If
    Next i
    
    MsgBox "Auditoria Forense concluída!" & vbCrLf & vbCrLf & _
           "• Ocorrências identificadas: " & totalAlertas & vbCrLf & _
           "• O texto foi grifado no Word e recebeu comentários nativos de revisão." & vbCrLf & _
           "• O painel completo de auditoria foi aberto na interface.", vbInformation, "Resultado da Auditoria"
End Sub

Private Sub AbrirPainelDiagnosticoWeb()
    On Error Resume Next
    ' Aciona a abertura da interface de diagnóstico detalhado
    Dim sh As Object
    Set sh = CreateObject("WScript.Shell")
    sh.Run "http://127.0.0.1:23119/painel-auditoria", 1, False
End Sub

' ==============================================================================
' 3. FORMATO HÍBRIDO DE CITAÇÃO: CAMPOS NATIVOS WORD (ZOTERO) E BOOKMARKS (MENDELEY)
' ==============================================================================

Private Sub InserirCitacaoHibrida(ByVal textoCitacao As String, ByVal modo As String)
    Dim rng As Range
    Set rng = Selection.Range
    
    If modo = "campos" Then
        ' Formato 1: Campo Nativo do Word (wdFieldAddin no padrão Zotero)
        ' Protege o texto contra edição inadvertida
        Dim fld As Field
        Set fld = ActiveDocument.Fields.Add(Range:=rng, Type:=wdFieldAddin, _
                                           Text:="BIBLIOGRAFIA_ITEM " & textoCitacao, _
                                           PreserveFormatting:=True)
        rng.Text = textoCitacao
    Else
        ' Formato 2: Texto Puro com Bookmark delimitador (Padrão ZOTERO_BREF_ / Mendeley)
        Dim nomeBookmark As String
        nomeBookmark = "BIB_BREF_" & Hex(CLng(Timer * 100)) & "_" & Int(Rnd * 1000)
        
        rng.Text = textoCitacao
        ActiveDocument.Bookmarks.Add nomeBookmark, rng
    End If
    
    Selection.Collapse wdCollapseEnd
End Sub

Private Function ObterModoCitacao() As String
    On Error Resume Next
    Dim modo As String
    modo = GetSetting("BibliografiaWord", "Config", CHAVE_MODO_CITACAO, "campos")
    If modo <> "campos" And modo <> "bookmarks" Then modo = "campos"
    ObterModoCitacao = modo
End Function

Private Sub SalvarModoCitacao(ByVal novoModo As String)
    SaveSetting "BibliografiaWord", "Config", CHAVE_MODO_CITACAO, novoModo
End Sub

' ==============================================================================
' 4. MOTOR HTTP WINHTTP 5.1 & UTILITÁRIOS UTF-8
' ==============================================================================

Private Function EnviarRequisicaoHttp(ByVal metodo As String, ByVal url As String, _
                                     ByVal corpoPost As String, ByRef statusOut As Long) As String
    Dim http As Object
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    
    http.Open metodo, url, False
    http.SetTimeouts TIMEOUT_SEGUNDOS * 1000, TIMEOUT_SEGUNDOS * 1000, _
                      TIMEOUT_SEGUNDOS * 1000, TIMEOUT_SEGUNDOS * 1000
    
    http.SetRequestHeader "Content-Type", "application/json; charset=utf-8"
    http.SetRequestHeader "User-Agent", "BibliografiaWordPlugin/2.0 (Windows 365 Desktop)"
    
    If metodo = "POST" And Len(corpoPost) > 0 Then
        Dim bytesCorpo() As Byte
        bytesCorpo = ConverterParaUtf8(corpoPost)
        http.Send bytesCorpo
    Else
        http.Send
    End If
    
    statusOut = http.Status
    EnviarRequisicaoHttp = http.ResponseText
End Function

Private Function ConverterParaUtf8(ByVal texto As String) As Byte()
    Dim stm As Object
    Set stm = CreateObject("ADODB.Stream")
    stm.Type = 2
    stm.Charset = "utf-8"
    stm.Open
    stm.WriteText texto
    stm.Position = 0
    stm.Type = 1
    ConverterParaUtf8 = stm.Read
    stm.Close
End Function

Private Function EscaparJson(ByVal txt As String) As String
    Dim s As String
    s = txt
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, vbCrLf, "\n")
    s = Replace(s, vbCr, "\n")
    s = Replace(s, vbLf, "\n")
    s = Replace(s, vbTab, "\t")
    EscaparJson = """" & s & """"
End Function

Private Function ExtrairCampoJson(ByVal json As String, ByVal campo As String) As String
    On Error Resume Next
    Dim tag As String, p1 As Long, p2 As Long
    tag = """" & campo & """:"
    p1 = InStr(json, tag)
    If p1 = 0 Then Exit Function
    
    p1 = p1 + Len(tag)
    ' Pula espaços
    While Mid(json, p1, 1) = " " Or Mid(json, p1, 1) = """"
        p1 = p1 + 1
    Wend
    
    p2 = InStr(p1, json, """")
    If p2 = 0 Then p2 = InStr(p1, json, ",")
    If p2 = 0 Then p2 = InStr(p1, json, "}")
    
    If p2 > p1 Then
        Dim valStr As String
        valStr = Mid(json, p1, p2 - p1)
        valStr = Replace(valStr, """", "")
        valStr = Replace(valStr, "\n", " ")
        ExtrairCampoJson = Trim(valStr)
    End If
End Function
