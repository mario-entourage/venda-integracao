'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Key as KeyIcon, Loader2, Trash2 } from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  API_KEY_LEVELS,
  API_KEY_LEVEL_LABELS,
  type ApiKeyLevel,
} from '@/types/api-key';

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  level: ApiKeyLevel;
  active: boolean;
  createdAt: string | null;
  createdByEmail: string;
  lastUsedAt: string | null;
  requestCount: number;
  revokedAt: string | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString('pt-BR') +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
}

export default function ApiKeysPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();

  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createLevel, setCreateLevel] = useState<ApiKeyLevel>('L1');
  const [creating, setCreating] = useState(false);

  const [revealOpen, setRevealOpen] = useState(false);
  const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/api-keys');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch (err) {
      console.error('[api-keys] List failed:', err);
      toast({
        title: 'Falha ao carregar chaves',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [authFetch, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch('/api/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: createName.trim(), level: createLevel }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCreateOpen(false);
      setCreateName('');
      setCreateLevel('L1');
      setRevealedPlaintext(data.plaintext);
      setRevealOpen(true);
      void refresh();
    } catch (err) {
      toast({
        title: 'Falha ao criar chave',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      const res = await authFetch(`/api/admin/api-keys/${revokeTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: 'Chave revogada' });
      setRevokeTarget(null);
      void refresh();
    } catch (err) {
      toast({
        title: 'Falha ao revogar chave',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const copyPlaintext = async () => {
    if (!revealedPlaintext) return;
    await navigator.clipboard.writeText(revealedPlaintext);
    toast({ title: 'Chave copiada para a área de transferência' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chaves de API"
        description="Gerencie chaves para acesso externo aos dados desta aplicação. Apenas administradores."
      >
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <KeyIcon className="mr-2 h-4 w-4" />
              Nova chave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar nova chave de API</DialogTitle>
              <DialogDescription>
                A chave em texto puro será exibida uma única vez após a criação
                e não poderá ser recuperada depois.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="key-name">Nome / descrição</Label>
                <Input
                  id="key-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex.: Integração relatórios financeiros"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-level">Nível de acesso</Label>
                <Select
                  value={createLevel}
                  onValueChange={(v) => setCreateLevel(v as ApiKeyLevel)}
                >
                  <SelectTrigger id="key-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_KEY_LEVELS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        {API_KEY_LEVEL_LABELS[lvl]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Os níveis são cumulativos: L3 inclui L2, que inclui L1.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={creating || !createName.trim()}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar chave
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : !keys || keys.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhuma chave de API criada ainda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Prefixo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead>Criada por</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead className="text-right">Requisições</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{k.level}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {k.keyPrefix}…
                    </TableCell>
                    <TableCell>
                      {k.active ? (
                        <Badge>Ativa</Badge>
                      ) : (
                        <Badge variant="outline">Revogada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(k.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.createdByEmail}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(k.lastUsedAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.requestCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRevokeTarget(k)}
                          aria-label="Revogar chave"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reveal-once dialog */}
      <Dialog open={revealOpen} onOpenChange={setRevealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sua nova chave de API</DialogTitle>
            <DialogDescription>
              Copie e armazene esta chave agora. Ela <strong>não</strong> poderá
              ser recuperada depois — apenas seu hash é armazenado.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted p-3 font-mono text-sm break-all">
            {revealedPlaintext}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyPlaintext}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </Button>
            <Button
              onClick={() => {
                setRevealOpen(false);
                setRevealedPlaintext(null);
              }}
            >
              Já armazenei a chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar chave?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave <strong>{revokeTarget?.name}</strong> será desativada
              imediatamente. Esta ação não pode ser desfeita — qualquer sistema
              que ainda use esta chave começará a receber 401.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke}>Revogar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
