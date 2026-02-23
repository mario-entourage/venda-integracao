import { z } from 'zod';

export const addressSchema = z.object({
  postalCode: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP invalido'),
  street: z.string().min(1, 'Rua obrigatoria'),
  number: z.string().min(1, 'Numero obrigatorio'),
  complement: z.string().optional(),
  neighborhood: z.string().min(1, 'Bairro obrigatorio'),
  city: z.string().min(1, 'Cidade obrigatoria'),
  state: z.string().length(2, 'UF deve ter 2 caracteres'),
  country: z.string().default('BR'),
});
export type AddressFormValues = z.infer<typeof addressSchema>;

export const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const customerSchema = z.object({
  document: z.string().min(11, 'CPF/CNPJ obrigatorio'),
  firstName: z.string().min(1, 'Nome obrigatorio'),
  lastName: z.string().optional(),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  phone: z.string().optional(),
  birthDate: z.date().optional(),
  sex: z.enum(['M', 'F', 'O']).optional(),
  motherName: z.string().optional(),
  representativeId: z.string().optional(),
  address: addressSchema.optional(),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;

export const representativeSchema = z.object({
  document: z.string().min(11, 'CPF/CNPJ obrigatorio'),
  firstName: z.string().min(1, 'Nome obrigatorio'),
  lastName: z.string().optional(),
  email: z.string().email('Email invalido'),
  phone: z.string().optional(),
});
export type RepresentativeFormValues = z.infer<typeof representativeSchema>;

export const doctorSchema = z.object({
  document: z.string().min(11, 'CPF obrigatorio'),
  firstName: z.string().min(1, 'Nome obrigatorio'),
  lastName: z.string().optional(),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  crm: z.string().min(1, 'CRM obrigatorio'),
  mainSpecialtyId: z.string().optional(),
  specialtyIds: z.array(z.string()).optional(),
});
export type DoctorFormValues = z.infer<typeof doctorSchema>;

export const productSchema = z.object({
  name: z.string().min(1, 'Nome obrigatorio'),
  description: z.string().optional(),
  sku: z.string().min(1, 'SKU obrigatorio'),
  hsCode: z.string().min(1, 'HS Code obrigatorio'),
  concentration: z.string().optional(),
  price: z.number().positive('Preco deve ser positivo'),
  inventory: z.number().int().nonnegative().optional(),
});
export type ProductFormValues = z.infer<typeof productSchema>;

export const orderSchema = z.object({
  customerId: z.string().min(1, 'Cliente obrigatorio'),
  representativeId: z.string().min(1, 'Representante obrigatorio'),
  doctorId: z.string().min(1, 'Medico obrigatorio'),
  products: z.array(z.object({
    stockProductId: z.string().min(1),
    quantity: z.number().int().positive(),
    price: z.number().positive(),
    discount: z.number().min(0).default(0),
  })).min(1, 'Pelo menos um produto obrigatorio'),
  currency: z.string().default('BRL'),
  discount: z.number().min(0).default(0),
  legalGuardian: z.boolean().default(false),
  anvisaOption: z.enum(['regular', 'exceptional', 'exempt']).optional(),
  type: z.enum(['sale', 'return', 'exchange']).default('sale'),
  shippingAddress: addressSchema,
});
export type OrderFormValues = z.infer<typeof orderSchema>;

export const userCreationSchema = z.object({
  document: z.string().min(11, 'CPF/CNPJ obrigatorio'),
  firstName: z.string().min(1, 'Nome obrigatorio'),
  lastName: z.string().optional(),
  email: z.string().email('Email invalido'),
  phone: z.string().optional(),
  groupId: z.string().min(1, 'Grupo obrigatorio'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});
export type UserCreationFormValues = z.infer<typeof userCreationSchema>;
