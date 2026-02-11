import * as bcrypt from 'bcrypt';

interface SeedProduct {
    description: string;
    images: string[];
    stock: number;
    price: number;
    slug: string;
    title: string;
}


interface SeedUser {
    employeeNumber: string;
    nationalId: string;
    fullName: string;
    password: string;
    roles:     string[];
}


interface SeedData {
    users: SeedUser[];
    products: SeedProduct[];
}


export const initialData: SeedData = {

    users: [
        {
            employeeNumber: '1001',
            nationalId: '12345678',
            fullName: 'Test One',
            password: bcrypt.hashSync( '12345678', 10 ),
            roles: ['admin']
        },
        {
            employeeNumber: '1002',
            nationalId: '87654321',
            fullName: 'Test Two',
            password: bcrypt.hashSync( '87654321', 10 ),
            roles: ['user','super']
        }
    ],

    products: [
        {
            description: "Asado",
            images: [
                '731641c5-98c0-4b2b-90dd-60e05b66cada.jpeg'
            ],
            stock: 7,
            price: 75,
            slug: "asado_consumo_interno",
            title: "Asado consumo interno",
        },
    ]
}
