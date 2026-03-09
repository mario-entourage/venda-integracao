import { Download, ExternalLink, Monitor, Chrome, FileUp, ListChecks, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function ExtensaoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Extensão ANVISA Auto-Fill"
        description="Extensão do Chrome para preenchimento automático do formulário ANVISA"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Download card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Download className="h-5 w-5" />
                Baixar Extensão
              </CardTitle>
              <Badge variant="secondary">v1.3.0</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Baixe o arquivo .zip e instale a extensão no Chrome em modo desenvolvedor.
            </p>
            <div className="flex flex-col gap-3">
              <Button asChild className="w-full gap-2">
                <a href="/extensao-anvisa.zip" download>
                  <Download className="h-4 w-4" />
                  Baixar Extensão (.zip)
                </a>
              </Button>
              <Button variant="outline" asChild className="w-full gap-2">
                <a
                  href="https://github.com/mario-entourage/Anvisa_app/tree/main/extension"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver no GitHub
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Installation instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Chrome className="h-5 w-5" />
              Como Instalar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                <span>Baixe o arquivo <strong>.zip</strong> e extraia em uma pasta local.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                <span>No Chrome, acesse <code className="rounded bg-muted px-1.5 py-0.5 text-xs">chrome://extensions</code></span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                <span>Ative o <strong>Modo do desenvolvedor</strong> no canto superior direito.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                <span>Clique em <strong>Carregar sem compactação</strong> e selecione a pasta extraída.</span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-5 w-5" />
            Como Funciona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">1. Crie a solicitação</p>
              <p className="text-muted-foreground">
                Use a página <strong>Nova Solicitação</strong> para fazer upload dos documentos. A IA extrai os dados automaticamente via OCR.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">2. Envie para a extensão</p>
              <p className="text-muted-foreground">
                Na etapa de validação, os dados extraídos e os arquivos são enviados automaticamente para a extensão.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">3. Preencha o formulário</p>
              <p className="text-muted-foreground">
                Acesse o portal ANVISA e a extensão preenche campos de texto, dropdowns e faz upload dos documentos automaticamente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListChecks className="h-5 w-5" />
            Funcionalidades
          </CardTitle>
          <CardDescription>O que a extensão v1.3.0 faz no formulário ANVISA</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Text + select fields */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600">
                  <ListChecks className="h-4 w-4" />
                </div>
                <p className="font-medium text-sm">Campos de Texto e Selects</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Preenche automaticamente 25+ campos incluindo dados do paciente, solicitante e prescritor. Suporta <strong>selects nativos</strong>, <strong>DS Gov (br-select)</strong> e <strong>react-select</strong>.
              </p>
            </div>

            {/* Cascading dropdowns */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600">
                  <ChevronDown className="h-4 w-4" />
                </div>
                <p className="font-medium text-sm">Dropdowns em Cascata</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Ao selecionar o <strong>Estado</strong>, a extensão aguarda o carregamento das cidades e seleciona o <strong>Município</strong> correto automaticamente.
              </p>
            </div>

            {/* File uploads */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-green-100 text-green-600">
                  <FileUp className="h-4 w-4" />
                </div>
                <p className="font-medium text-sm">Upload de Documentos</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Faz upload automático dos documentos (RG, comprovante de residência, receita médica, procuração) diretamente do sistema para o formulário ANVISA.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
