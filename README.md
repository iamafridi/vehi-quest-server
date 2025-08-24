# VehiQuest 🚗

A modern vehicle rental platform built with React and Node.js, featuring role-based access control, secure payments, and real-time booking management.

## 🌟 Features

### 🔐 Authentication & Authorization

- **Multi-Provider Authentication**: Email/Password and Google OAuth integration
- **Role-Based Access Control**: Admin, Host, and Guest user roles
- **JWT Token Management**: Secure authentication with HTTP-only cookies
- **Protected Routes**: Route-level authorization for different user types

### 🚙 Vehicle Management

- **Vehicle Listings**: Browse and search available vehicles
- **Host Dashboard**: Add, edit, and manage vehicle listings
- **Vehicle Details**: Comprehensive vehicle information with image galleries
- **Availability Tracking**: Real-time booking status management

### 💳 Booking & Payments

- **Secure Payments**: Stripe integration for safe transactions
- **Booking Management**: Complete booking lifecycle management
- **Email Notifications**: Automated booking confirmations via Nodemailer
- **Transaction History**: Detailed booking and payment records

### 📊 Analytics & Reporting

- **Admin Dashboard**: Platform-wide statistics and user management
- **Host Analytics**: Revenue tracking and booking insights
- **Guest Statistics**: Personal booking history and spending analysis
- **Interactive Charts**: Visual representation of data trends

### 🎨 User Experience

- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Modern UI**: Clean and intuitive user interface
- **Loading States**: Smooth user experience with proper loading indicators
- **Error Handling**: Comprehensive error management and user feedback

## 🛠️ Tech Stack

### Frontend

- **React 18**: Modern React with hooks and functional components
- **React Router DOM**: Client-side routing with protected routes
- **Tailwind CSS**: Utility-first CSS framework
- **React Query (TanStack Query)**: Server state management
- **React Hook Form**: Efficient form handling
- **React Hot Toast**: User-friendly notifications
- **React Date Range**: Date picker for booking periods
- **React Helmet Async**: Dynamic document head management
- **Lucide React**: Beautiful icon library

### Backend

- **Node.js**: JavaScript runtime environment
- **Express.js**: Fast and minimal web framework
- **MongoDB**: NoSQL database with Mongoose ODM
- **JWT**: JSON Web Token for authentication
- **Stripe**: Payment processing platform
- **Nodemailer**: Email sending functionality
- **Morgan**: HTTP request logger
- **CORS**: Cross-Origin Resource Sharing
- **Cookie Parser**: Parse HTTP cookies

### Authentication & Security

- **Firebase Authentication**: Secure user authentication
- **bcrypt**: Password hashing (if using custom auth)
- **HTTP-only Cookies**: Secure token storage
- **Environment Variables**: Secure configuration management

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB database
- Stripe account for payments
- Firebase project for authentication
- Gmail account for email services

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/iamafridi/vehiquest.git
   cd vehiquest
   ```

2. **Install dependencies**

   Frontend:

   ```bash
   cd client
   npm install
   ```

   Backend:

   ```bash
   cd server
   npm install
   ```

3. **Environment Setup**

   Create `.env` file in the server directory:

   ```env
   # Database
   DB_USER=your_mongodb_username
   DB_PASS=your_mongodb_password

   # JWT
   ACCESS_TOKEN_SECRET=your_jwt_secret_key

   # Stripe
   PAYMENT_SECRET_KEY=your_stripe_secret_key

   # Email Service
   USER=your_gmail_address
   PASS=your_gmail_app_password

   # Server
   PORT=5000
   NODE_ENV=development
   ```

   Create `.env.local` file in the client directory:

   ```env
   # Firebase Config
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_firebase_app_id

   # API URL
   VITE_API_URL=http://localhost:5000
   ```

4. **Firebase Setup**

   - Create a Firebase project
   - Enable Authentication with Email/Password and Google providers
   - Add your domain to authorized domains
   - Copy configuration to environment variables

5. **MongoDB Setup**

   - Create a MongoDB Atlas account or set up local MongoDB
   - Create a database named `vehiQuest`
   - Add your connection string to environment variables

6. **Stripe Setup**
   - Create a Stripe account
   - Get your secret key from the dashboard
   - Add to environment variables

### Running the Application

1. **Start the backend server**

   ```bash
   cd server
   npm start
   ```

   Server will run on `http://localhost:5000`

2. **Start the frontend application**
   ```bash
   cd client
   npm run dev
   ```
   Application will run on `http://localhost:5173`

## 📱 Usage Guide

### For Guests (Renters)

1. **Sign Up/Login**: Create account or login with email/Google
2. **Browse Vehicles**: Explore available vehicles with filters
3. **Book Vehicle**: Select dates and complete secure payment
4. **Manage Bookings**: View and manage your reservations
5. **View Statistics**: Track your rental history and spending

### For Hosts (Vehicle Owners)

1. **Request Host Role**: Sign up and request host privileges
2. **Add Vehicles**: List your vehicles with details and images
3. **Manage Listings**: Edit, update, or remove your vehicles
4. **Track Bookings**: Monitor reservations and revenue
5. **Analytics Dashboard**: View earnings and booking trends

### For Administrators

1. **User Management**: Manage user roles and permissions
2. **Platform Overview**: Monitor platform-wide statistics
3. **Content Moderation**: Review and manage listings
4. **Analytics**: View comprehensive platform analytics

## 🏗️ Project Structure

```
vehiquest/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── api/           # API service functions
│   │   ├── routes/        # Route configurations
│   │   ├── providers/     # Context providers
│   │   ├── layouts/       # Layout components
│   │   └── firebase/      # Firebase configuration
│   ├── public/            # Static assets
│   └── package.json
├── server/                # Node.js backend
│   ├── index.js          # Main server file
│   ├── middleware/       # Custom middleware
│   ├── routes/           # API routes
│   ├── models/           # Database models
│   ├── controllers/      # Route controllers
│   ├── utils/            # Utility functions
│   └── package.json
└── README.md
```

## 🔒 Security Features

- **Authentication**: Multi-provider authentication with Firebase
- **Authorization**: Role-based access control
- **Token Security**: HTTP-only cookies for JWT storage
- **Data Validation**: Input validation and sanitization
- **CORS Protection**: Configured cross-origin resource sharing
- **Environment Security**: Sensitive data in environment variables
- **Password Security**: Secure password handling with Firebase
- **Payment Security**: PCI-compliant payment processing with Stripe

## 📊 API Endpoints

### Authentication

- `PUT /jwt` - Generate JWT token
- `GET /logout` - Clear authentication cookie

### Users

- `PUT /users/:email` - Create or update user
- `GET /users` - Get all users (Admin only)

### Vehicles

- `GET /vehicles` - Get all vehicles
- `POST /vehicles` - Create new vehicle listing
- `GET /vehicle/:id` - Get single vehicle
- `PUT /vehicles/:id` - Update vehicle
- `DELETE /vehicles/:id` - Delete vehicle
- `GET /rooms/:email` - Get vehicles by host

### Bookings

- `POST /bookings` - Create new booking
- `GET /bookings` - Get user bookings
- `GET /bookings/host` - Get host bookings
- `DELETE /bookings/:id` - Cancel booking
- `PATCH /vehicles/status/:id` - Update booking status

### Payments

- `POST /create-payment-intent` - Create Stripe payment intent

### Statistics

- `GET /admin-stat` - Admin dashboard statistics
- `GET /host-stat` - Host dashboard statistics
- `GET /guest-stat` - Guest dashboard statistics

## 🧪 Testing

```bash
# Run frontend tests
cd client
npm test

# Run backend tests
cd server
npm test
```

## 🚀 Deployment

### Frontend Deployment (Netlify/Vercel)

1. Build the application:
   ```bash
   cd client
   npm run build
   ```
2. Deploy the `dist` folder to your hosting platform
3. Configure environment variables on the hosting platform

### Backend Deployment (Railway/Heroku)

1. Ensure all environment variables are set
2. Update CORS origins for production domains
3. Deploy to your preferred platform
4. Update frontend API URLs to production backend URL

### Database

- Use MongoDB Atlas for production database
- Ensure proper indexing for performance
- Set up database backups

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow ESLint configuration
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed
- Follow the existing code style

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- **Email**: afridiakbarifty@gmail.com

## 🙏 Acknowledgments

- **Firebase** for authentication services
- **Stripe** for secure payment processing
- **MongoDB Atlas** for database hosting
- **Tailwind CSS** for styling framework
- **React Community** for excellent libraries and tools

## 📈 Roadmap

- [ ] **Mobile App**: React Native mobile application
- [ ] **Advanced Search**: Enhanced filtering and search capabilities
- [ ] **Reviews System**: User reviews and ratings
- [ ] **Real-time Chat**: Communication between hosts and guests
- [ ] **Multi-language**: Internationalization support
- [ ] **Push Notifications**: Real-time booking notifications
- [ ] **Advanced Analytics**: ML-powered insights and recommendations

---

**VehiQuest** - Driving the future of vehicle rentals 🚗✨
