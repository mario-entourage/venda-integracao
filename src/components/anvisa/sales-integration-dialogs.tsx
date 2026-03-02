'use client';

import { useState } from 'react';
import { AlertCircle, Check, UserPlus, Users, X, Loader2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp, Firestore } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

import type { OcrData } from '@/types/anvisa';
import type { PrescriptionMatch } from '@/hooks/anvisa/use-sales-integration-check';
import { salesDateToAnvisaDate, ocrDataToNewClient, ocrDataToNewDoctor } from '@/lib/anvisa-matching-utils';

export interface ReuseDecision {
  reusePatient: boolean;
  reuseDoctor: boolean;
  reusePrescription: boolean;
  selectedMatch: PrescriptionMatch;
}

// ============================================================================
// 1. DuplicatePrescriptionDialog
// ============================================================================

interface DuplicatePrescriptionDialogProps {
  open: boolean;
  matches: PrescriptionMatch[];
  onProceedNew: () => void;
  onReuseData: (decision: ReuseDecision) => void;
  onCancel: () => void;
}

export function DuplicatePrescriptionDialog({
  open,
  matches,
  onProceedNew,
  onReuseData,
  onCancel,
}: DuplicatePrescriptionDialogProps) {
  const [reusePatient, setReusePatient] = useState(true);
  const [reuseDoctor, setReuseDoctor] = useState(true);
  const [reusePrescription, setReusePrescription] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const handleReuse = () => {
    const selected = matches[selectedIdx];
    if (!selected) return;
    onReuseData({
      reusePatient,
      reuseDoctor,
      reusePrescription,
      selectedMatch: selected,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Receita Possivelmente Duplicada
          </DialogTitle>
          <DialogDescription>
            Encontramos receitas semelhantes no sistema de vendas. Verifique abaixo e escolha como prosseguir.
          </DialogDescription>
        </DialogHeader>

        {/* Matches table */}
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Medico</TableHead>
                <TableHead>UF</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Criado por</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>ANVISA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map((match, idx) => (
                <TableRow
                  key={match.prescriptionId}
                  className={selectedIdx === idx ? 'bg-accent' : 'cursor-pointer hover:bg-muted/50'}
                  onClick={() => setSelectedIdx(idx)}
                >
                  <TableCell>
                    <input
                      type="radio"
                      name="selectedMatch"
                      checked={selectedIdx === idx}
                      onChange={() => setSelectedIdx(idx)}
                      className="accent-primary"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{match.clientName}</TableCell>
                  <TableCell>{salesDateToAnvisaDate(match.prescriptionDate)}</TableCell>
                  <TableCell>{match.doctorName}</TableCell>
                  <TableCell>{match.doctorState}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {match.products.join(', ') || '-'}
                  </TableCell>
                  <TableCell className="text-sm">{match.createdByEmail || '-'}</TableCell>
                  <TableCell className="text-sm">
                    {match.createdAt
                      ? new Date(match.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={match.anvisaSubmitted ? 'default' : 'outline'}>
                      {match.anvisaSubmitted ? 'Enviado' : 'Pendente'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Reuse checkboxes */}
        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium">Dados a reutilizar:</p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="reuse-patient"
              checked={reusePatient}
              onCheckedChange={(v) => setReusePatient(v === true)}
            />
            <label htmlFor="reuse-patient" className="text-sm cursor-pointer">
              Reutilizar dados do paciente
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="reuse-doctor"
              checked={reuseDoctor}
              onCheckedChange={(v) => setReuseDoctor(v === true)}
            />
            <label htmlFor="reuse-doctor" className="text-sm cursor-pointer">
              Reutilizar dados do medico
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="reuse-prescription"
              checked={reusePrescription}
              onCheckedChange={(v) => setReusePrescription(v === true)}
            />
            <label htmlFor="reuse-prescription" className="text-sm cursor-pointer">
              Reutilizar dados da receita (data, medicamento, dosagem)
            </label>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={onCancel}>
            <X className="mr-2 h-4 w-4" /> Cancelar
          </Button>
          <Button variant="outline" onClick={onProceedNew}>
            Prosseguir como nova
          </Button>
          <Button
            onClick={handleReuse}
            disabled={!reusePatient && !reuseDoctor && !reusePrescription}
          >
            <Check className="mr-2 h-4 w-4" /> Reutilizar selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 2. SimilarEntityDialog -- informational/verification only
// ============================================================================

interface SimilarEntityDialogProps {
  open: boolean;
  entityType: 'patient' | 'doctor';
  extractedData: Record<string, string>;
  existingData: Record<string, string>;
  existingName: string;
  onConfirmMatch: () => void;
  onDismiss: () => void;
}

export function SimilarEntityDialog({
  open,
  entityType,
  extractedData,
  existingData,
  existingName,
  onConfirmMatch,
  onDismiss,
}: SimilarEntityDialogProps) {
  const title = entityType === 'patient'
    ? 'Paciente Similar Encontrado'
    : 'Medico Similar Encontrado';
  const description = entityType === 'patient'
    ? `O paciente abaixo e similar ao encontrado nos documentos. Confirme se e a mesma pessoa.`
    : `O medico abaixo e similar ao encontrado nos documentos. Confirme se e a mesma pessoa.`;

  const fieldLabels: Record<string, string> = {
    patientName: 'Nome',
    patientCpf: 'CPF',
    patientRg: 'RG',
    patientDob: 'Nascimento',
    patientPhone: 'Telefone',
    patientEmail: 'E-mail',
    patientCity: 'Cidade',
    patientState: 'Estado',
    doctorName: 'Nome',
    doctorCrm: 'CRM',
    doctorSpecialty: 'Especialidade',
    doctorUf: 'Estado',
    doctorCity: 'Cidade',
    doctorPhone: 'Telefone',
    doctorMobile: 'Celular',
    doctorEmail: 'E-mail',
  };

  // Get the union of all keys
  const allKeys = Array.from(new Set([...Object.keys(extractedData), ...Object.keys(existingData)]));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDismiss(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campo</TableHead>
                <TableHead>Dados extraidos</TableHead>
                <TableHead>Dados existentes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allKeys.map((key) => {
                const extracted = extractedData[key] || '-';
                const existing = existingData[key] || '-';
                const isDifferent = extracted !== '-' && existing !== '-' && extracted !== existing;
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-sm">{fieldLabels[key] || key}</TableCell>
                    <TableCell className="text-sm">{extracted}</TableCell>
                    <TableCell className={`text-sm ${isDifferent ? 'text-amber-600 font-medium' : ''}`}>
                      {existing}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDismiss}>
            Nao e a mesma pessoa
          </Button>
          <Button onClick={onConfirmMatch}>
            <Check className="mr-2 h-4 w-4" /> Confirmar: e a mesma pessoa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 3. NewEntityDialog -- offer to add new client/doctor to Sales Integration
// ============================================================================

interface NewEntityDialogProps {
  open: boolean;
  entityType: 'patient' | 'doctor';
  ocrData: Partial<OcrData>;
  firestore: Firestore | null;
  onAdded: () => void;
  onSkip: () => void;
}

export function NewEntityDialog({
  open,
  entityType,
  ocrData,
  firestore,
  onAdded,
  onSkip,
}: NewEntityDialogProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);

  const title = entityType === 'patient'
    ? 'Novo Paciente Detectado'
    : 'Novo Medico Detectado';
  const description = entityType === 'patient'
    ? 'Este paciente nao foi encontrado no sistema de vendas. Deseja adiciona-lo?'
    : 'Este medico nao foi encontrado no sistema de vendas. Deseja adiciona-lo?';

  // Build summary data for display
  const summaryFields: { label: string; value: string }[] = [];
  if (entityType === 'patient') {
    if (ocrData.patientName) summaryFields.push({ label: 'Nome', value: ocrData.patientName });
    if (ocrData.patientCpf) summaryFields.push({ label: 'CPF', value: ocrData.patientCpf });
    if (ocrData.patientRg) summaryFields.push({ label: 'RG', value: ocrData.patientRg });
    if (ocrData.patientDob) summaryFields.push({ label: 'Nascimento', value: ocrData.patientDob });
    if (ocrData.patientPhone) summaryFields.push({ label: 'Telefone', value: ocrData.patientPhone });
    if (ocrData.patientEmail) summaryFields.push({ label: 'E-mail', value: ocrData.patientEmail });
    if (ocrData.patientCity) summaryFields.push({ label: 'Cidade', value: ocrData.patientCity });
    if (ocrData.patientState) summaryFields.push({ label: 'Estado', value: ocrData.patientState });
  } else {
    if (ocrData.doctorName) summaryFields.push({ label: 'Nome', value: ocrData.doctorName });
    if (ocrData.doctorCrm) summaryFields.push({ label: 'CRM', value: ocrData.doctorCrm });
    if (ocrData.doctorSpecialty) summaryFields.push({ label: 'Especialidade', value: ocrData.doctorSpecialty });
    if (ocrData.doctorUf) summaryFields.push({ label: 'Estado', value: ocrData.doctorUf });
    if (ocrData.doctorCity) summaryFields.push({ label: 'Cidade', value: ocrData.doctorCity });
    if (ocrData.doctorPhone) summaryFields.push({ label: 'Telefone', value: ocrData.doctorPhone });
    if (ocrData.doctorMobile) summaryFields.push({ label: 'Celular', value: ocrData.doctorMobile });
    if (ocrData.doctorEmail) summaryFields.push({ label: 'E-mail', value: ocrData.doctorEmail });
  }

  const handleAdd = async () => {
    if (!firestore) return;
    setIsAdding(true);
    try {
      if (entityType === 'patient') {
        const clientData = ocrDataToNewClient(ocrData);
        await addDoc(collection(firestore, 'clients'), {
          ...clientData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Paciente adicionado', description: `${ocrData.patientName} foi adicionado ao sistema de vendas.` });
      } else {
        const doctorData = ocrDataToNewDoctor(ocrData);
        await addDoc(collection(firestore, 'doctors'), {
          ...doctorData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Medico adicionado', description: `${ocrData.doctorName} foi adicionado ao sistema de vendas.` });
      }
      onAdded();
    } catch (err) {
      console.error('Error adding entity:', err);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: `Nao foi possivel adicionar ao sistema de vendas.`,
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onSkip(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-green-600" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {summaryFields.map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}:</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
          {summaryFields.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum dado disponivel.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onSkip}>
            Nao adicionar
          </Button>
          <Button onClick={handleAdd} disabled={isAdding || summaryFields.length === 0}>
            {isAdding ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adicionando...</>
            ) : (
              <><UserPlus className="mr-2 h-4 w-4" /> Adicionar ao sistema</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
