
import React, { useState } from 'react';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';

const AuthPage: React.FC = () => {
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    if (mode === 'login') {
        return <LoginPage onSwitchMode={() => setMode('signup')} />;
    }

    return <SignUpPage onSwitchMode={() => setMode('login')} />;
};

export default AuthPage;
