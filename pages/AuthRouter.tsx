
import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import LoginPage from './LoginPage';
import WelcomePage from './WelcomePage';

const AuthRouter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [showWelcome, setShowWelcome] = useState(true);

  if (!session) {
    if (showWelcome) {
      return <WelcomePage onEnter={() => setShowWelcome(false)} />;
    }
    return <LoginPage />;
  }

  return <>{children}</>;
};

export default AuthRouter;
