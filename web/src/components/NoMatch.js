import React from 'react';
import {Button, Layout, Result, Space} from "antd";
import {Link, useNavigate} from "react-router-dom";

const {Content} = Layout;

const NoMatch = () => {

    let navigate = useNavigate();

    return (
        <div>
            <Content>
                <Result
                    status="404"
                    title="404"
                    subTitle="Page not found"
                />
            </Content>
        </div>
    );
};

export default NoMatch;