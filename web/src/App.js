import React, {Suspense} from 'react';
import {Outlet, Route, Routes} from "react-router-dom";

import './App.css';
import './Arco.css';

import NoMatch from "./components/NoMatch";
import Landing from "./components/Landing";

const Guacd = React.lazy(() => import("./components/access/Guacd"));
const Term = React.lazy(() => import("./components/access/Term"));

const App = () => {

    return (
        <Routes>
            <Route element={
                <Suspense fallback={<Landing/>}>
                    <Outlet/>
                </Suspense>
            }>
                <Route path="/access" element={<Guacd/>}/>
                <Route path="/term" element={<Term/>}/>
                <Route path="*" element={<NoMatch/>}/>
            </Route>
        </Routes>
    );
}

export default App;
