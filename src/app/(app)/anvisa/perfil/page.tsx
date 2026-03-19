'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Loader2, Save, UserCircle, Info } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { ANVISA_COLLECTIONS } from '@/lib/anvisa-paths';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

const BRAZILIAN_STATES = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
] as const;

const optionalRg = z.string().refine(
  (val) => !val || /^[\d.\-/]+$/.test(val),
  "Formato invalido. Insira apenas numeros, pontos, hifens ou barras."
);
const optionalCep = z.string().refine(
  (val) => !val || /^\d{5}-\d{3}$/.test(val),
  "Formato invalido (00000-000)."
);
const optionalPhone = z.string().refine(
  (val) => !val || /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(val.replace(/\s/g, '')),
  "Formato invalido. Ex: (31) 99999-9999"
);

const optionalDate = z.string().refine(
  (val) => !val || /^\d{2}\/\d{2}\/\d{4}$/.test(val),
  "Formato invalido (DD/MM/AAAA)."
);

const profileSchema = z.object({
  requesterName: z.string().default(''),
  requesterEmail: z.string().email("Email invalido").or(z.literal('')).default(''),
  requesterRg: optionalRg.default(''),
  requesterSexo: z.string().default(''),
  requesterDob: optionalDate.default(''),
  requesterAddress: z.string().default(''),
  requesterCep: optionalCep.default(''),
  requesterEstado: z.string().default(''),
  requesterMunicipio: z.string().default(''),
  requesterPhone: optionalPhone.default(''),
  requesterLandline: z.string().default(''),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function AnvisaPerfilPage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadedFromPadrao, setLoadedFromPadrao] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      requesterName: '',
      requesterEmail: '',
      requesterRg: '',
      requesterSexo: '',
      requesterDob: '',
      requesterAddress: '',
      requesterCep: '',
      requesterEstado: '',
      requesterMunicipio: '',
      requesterPhone: '',
      requesterLandline: '',
    },
  });

  // Load profile from Firestore, falling back to the Padrao user's profile for new users
  useEffect(() => {
    async function loadProfile() {
      if (!firestore || !user) return;
      try {
        const profileRef = doc(firestore, ANVISA_COLLECTIONS.userProfiles, user.uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data() as Partial<ProfileFormValues>;
          form.reset({
            requesterName: data.requesterName || '',
            requesterEmail: data.requesterEmail || '',
            requesterRg: data.requesterRg || '',
            requesterSexo: data.requesterSexo || '',
            requesterDob: data.requesterDob || '',
            requesterAddress: data.requesterAddress || '',
            requesterCep: data.requesterCep || '',
            requesterEstado: data.requesterEstado || '',
            requesterMunicipio: data.requesterMunicipio || '',
            requesterPhone: data.requesterPhone || '',
            requesterLandline: data.requesterLandline || '',
          });
        } else {
          // New user -- pre-fill from the Padrao user's profile
          try {
            const defaultProfileRef = doc(firestore, ANVISA_COLLECTIONS.defaultProfile, 'current');
            const defaultSnap = await getDoc(defaultProfileRef);
            if (defaultSnap.exists()) {
              const defaultData = defaultSnap.data() as { userId: string };
              if (defaultData.userId) {
                const padraoProfileRef = doc(firestore, ANVISA_COLLECTIONS.userProfiles, defaultData.userId);
                const padraoSnap = await getDoc(padraoProfileRef);
                if (padraoSnap.exists()) {
                  const pData = padraoSnap.data() as Partial<ProfileFormValues>;
                  form.reset({
                    requesterName: pData.requesterName || '',
                    requesterEmail: pData.requesterEmail || '',
                    requesterRg: pData.requesterRg || '',
                    requesterSexo: pData.requesterSexo || '',
                    requesterAddress: pData.requesterAddress || '',
                    requesterCep: pData.requesterCep || '',
                    requesterEstado: pData.requesterEstado || '',
                    requesterPhone: pData.requesterPhone || '',
                    requesterLandline: pData.requesterLandline || '',
                  });
                  setLoadedFromPadrao(true);
                }
              }
            }
          } catch {
            // Ignore errors loading default profile -- just start blank
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar perfil',
          description: 'Nao foi possivel carregar seus dados de perfil.',
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [firestore, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (values: ProfileFormValues) => {
    if (!firestore || !user) return;
    setIsSaving(true);
    try {
      const profileRef = doc(firestore, ANVISA_COLLECTIONS.userProfiles, user.uid);
      await setDoc(profileRef, values, { merge: true });
      toast({
        title: 'Perfil salvo',
        description: 'Seus dados de solicitante foram atualizados com sucesso.',
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      const message = error instanceof Error ? error.message : 'Nao foi possivel salvar seus dados de perfil.';
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar perfil',
        description: message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="bg-secondary p-3 rounded-full">
              <UserCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="font-headline text-2xl">Perfil do Solicitante ANVISA</CardTitle>
              <CardDescription>
                Gerencie os dados do solicitante que serao usados no formulario da ANVISA.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="grid gap-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Estes dados serao usados como valor padrao para preencher a secao &quot;Solicitante&quot; no formulario da ANVISA.
                  Voce pode alterar estes dados a qualquer momento.
                  {loadedFromPadrao && (
                    <span className="block mt-1 text-muted-foreground">
                      Os campos foram preenchidos com os dados do perfil padrao da empresa. Revise e salve.
                    </span>
                  )}
                </AlertDescription>
              </Alert>

              <FormField
                control={form.control}
                name="requesterName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo do Solicitante *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>
                      Nome da pessoa que sera o solicitante na ANVISA. Pode ser diferente do seu nome de login.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email do Solicitante *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterRg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>No do Documento de Identificacao (RG) *</FormLabel>
                    <FormControl>
                      <Input placeholder="MG-12.345.678" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>RG (Registro Geral) -- encontrado no verso da carteira de identidade</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterSexo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sexo/Genero *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSaving}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Masculino">Masculino</SelectItem>
                        <SelectItem value="Feminino">Feminino</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterDob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Nascimento *</FormLabel>
                    <FormControl>
                      <Input placeholder="DD/MM/AAAA" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>Data de nascimento do solicitante (formato DD/MM/AAAA)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereco *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Rua, numero, complemento, bairro..."
                        rows={3}
                        {...field}
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormDescription>Endereco completo do solicitante (multiplas linhas permitidas)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterCep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP *</FormLabel>
                    <FormControl>
                      <Input placeholder="00000-000" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterEstado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado (UF) *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSaving}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BRAZILIAN_STATES.map((uf) => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Estado do solicitante (usado no formulario da ANVISA)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterMunicipio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Municipio *</FormLabel>
                    <FormControl>
                      <Input placeholder="Belo Horizonte" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>Municipio do solicitante</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Celular *</FormLabel>
                    <FormControl>
                      <Input placeholder="(31) 99999-9999" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requesterLandline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone Fixo</FormLabel>
                    <FormControl>
                      <Input placeholder="(31) 3333-3333" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar Perfil
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
